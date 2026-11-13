// @vitest-environment node
import { notFound } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiPath, type FetchFunction } from './client';

const BASE_URL = 'http://127.0.0.1:3001';

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** A fetch that answers every request with `status` and `bodyText`, and records what it was asked. */
function fakeFetch(status: number, bodyText: string) {
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      init,
    });
    return Promise.resolve(new Response(bodyText, { status }));
  };
  return { fetchFunction, requests };
}

/** A fetch that never answers and rejects only when its signal aborts, like the real one. */
const hangingFetch: FetchFunction = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      // AbortSignal.timeout aborts with a DOMException named TimeoutError, which is an Error.
      const reason: unknown = init.signal?.reason;
      reject(reason instanceof Error ? reason : new Error('aborted'));
    });
  });

/** A fetch that sends headers at once, then a body that never ends and errors only when the signal aborts. */
const stalledBodyFetch: FetchFunction = (_input, init) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      init?.signal?.addEventListener('abort', () => {
        controller.error(init.signal?.reason);
      });
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
};

const json = (body: unknown): string => JSON.stringify(body);

/** The error notFound() throws, which Next must receive to render the not-found page. */
function captureNotFoundSignal(): Error {
  try {
    notFound();
  } catch (signal) {
    if (signal instanceof Error) {
      return signal;
    }
  }
  throw new Error('notFound() did not throw an Error');
}

describe('call', () => {
  it('returns the parsed body on 2xx and sends a no-store GET to base URL + path', async () => {
    const { fetchFunction, requests } = fakeFetch(
      200,
      json({ title: 'Frieren' }),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call<{ title: string }>('/anime/frieren');

    expect(result).toEqual({ ok: true, data: { title: 'Frieren' } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('http://127.0.0.1:3001/anime/frieren');
    expect(requests[0]?.init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes explicit Next fetch options and drops the no-store default when revalidate is set', async () => {
    const { fetchFunction, requests } = fakeFetch(200, json([]));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    await client.call('/anime', { next: { revalidate: 60, tags: ['anime'] } });
    await client.call('/anime', { cache: 'force-cache' });

    expect(requests[0]?.init).toMatchObject({
      cache: undefined,
      next: { revalidate: 60, tags: ['anime'] },
    });
    expect(requests[1]?.init).toMatchObject({ cache: 'force-cache' });
  });

  it('sends a JSON body with its content type', async () => {
    const { fetchFunction, requests } = fakeFetch(201, json({ id: 1 }));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call('/watchlist-entries', {
      method: 'POST',
      body: { animeId: 7 },
    });

    expect(result).toEqual({ ok: true, data: { id: 1 } });
    expect(requests[0]?.init).toMatchObject({
      method: 'POST',
      body: '{"animeId":7}',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('maps a 404 NOT_FOUND envelope to api_error', async () => {
    const envelope = {
      error: { code: 'NOT_FOUND', message: 'Cannot GET /anime/x' },
    };
    const { fetchFunction } = fakeFetch(404, json(envelope));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call('/anime/x');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'api_error', status: 404, error: envelope },
    });
  });

  it('maps a 400 VALIDATION_FAILED envelope to api_error with its details', async () => {
    const envelope = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request',
        details: [{ field: 'studio.name', message: 'name must be a string' }],
      },
    };
    const { fetchFunction } = fakeFetch(400, json(envelope));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call('/studios', { method: 'POST', body: {} });

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'api_error', status: 400, error: envelope },
    });
  });

  it('maps an HTML 502 from a proxy to invalid_response without keeping the body', async () => {
    const { fetchFunction } = fakeFetch(
      502,
      '<html><body>Bad Gateway nginx</body></html>',
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call('/anime');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 502 },
    });
    expect(JSON.stringify(result)).not.toContain('nginx');
  });

  it('maps an error status with JSON of the wrong shape to invalid_response', async () => {
    const { fetchFunction } = fakeFetch(
      500,
      json({ message: 'stack trace at /srv/app.js' }),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    const result = await client.call('/anime');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain('/srv/app.js');
  });

  it('maps a 2xx body rejected by isExpectedBody, or not JSON at all, to invalid_response', async () => {
    const isTitled = (body: unknown): body is { title: string } =>
      typeof body === 'object' &&
      body !== null &&
      'title' in body &&
      typeof body.title === 'string';
    const wrongShape = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(200, json({ title: 7 })).fetchFunction,
    });
    const notJson = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(200, 'OK').fetchFunction,
    });

    expect(
      await wrongShape.call('/anime/1', { isExpectedBody: isTitled }),
    ).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200 },
    });
    expect(await notJson.call('/anime/1')).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200 },
    });
  });

  it('maps a rejected fetch to network without the cause', async () => {
    const refusingFetch: FetchFunction = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:3001'),
        }),
      );
    const client = createApiClient({ baseUrl: BASE_URL, fetch: refusingFetch });

    expect(await client.call('/anime')).toEqual({
      ok: false,
      failure: { kind: 'network' },
    });
  });

  it('maps a request that outlives its timeout to timeout', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: hangingFetch,
      defaultTimeoutMs: 60_000,
    });

    expect(await client.call('/anime', { timeoutMs: 5 })).toEqual({
      ok: false,
      failure: { kind: 'timeout' },
    });
  });

  it.each([200, 299])('treats status %i as success', async (status) => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(status, json({ id: 1 })).fetchFunction,
    });

    expect(await client.call('/anime/1')).toEqual({
      ok: true,
      data: { id: 1 },
    });
  });

  it('treats status 300 as a failure even with a JSON body', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(300, json({ id: 1 })).fetchFunction,
    });

    expect(await client.call('/anime/1')).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 300 },
    });
  });

  it('returns ok with undefined data for an empty 204 body', async () => {
    // A 204 must carry a null body; new Response('', { status: 204 }) throws.
    const noContentFetch: FetchFunction = () =>
      Promise.resolve(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: noContentFetch,
    });

    expect(
      await client.call('/watchlist-entries/1', { method: 'DELETE' }),
    ).toEqual({ ok: true, data: undefined });
  });

  it('uses the client default timeout when the call sets none', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: hangingFetch,
      defaultTimeoutMs: 5,
    });

    expect(await client.call('/anime')).toEqual({
      ok: false,
      failure: { kind: 'timeout' },
    });
  });

  it('times out when the headers arrive but the body stalls', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: stalledBodyFetch,
    });

    expect(await client.call('/anime', { timeoutMs: 5 })).toEqual({
      ok: false,
      failure: { kind: 'timeout' },
    });
  });

  it('maps a connection reset while reading the body to network', async () => {
    const resetBodyFetch: FetchFunction = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new TypeError('terminated'));
            },
          }),
          { status: 200 },
        ),
      );
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: resetBodyFetch,
    });

    expect(await client.call('/anime')).toEqual({
      ok: false,
      failure: { kind: 'network' },
    });
  });

  it.each([
    ['@evil.example/anime', 'https://api.example'],
    ['/anime/../admin', BASE_URL],
    ['/anime/%2E%2E/admin', BASE_URL],
    ['/anime/..\\admin', BASE_URL],
    ['/api/./health', BASE_URL],
    ['/.\t./admin', BASE_URL],
    ['/\n../admin', BASE_URL],
  ])('refuses the path %j before any request', async (path, baseUrl) => {
    const { fetchFunction, requests } = fakeFetch(200, json({}));
    const client = createApiClient({ baseUrl, fetch: fetchFunction });

    await expect(client.call(path as ApiPath)).rejects.toThrow(
      'API path must start with "/"',
    );
    expect(requests).toHaveLength(0);
  });

  it('accepts dots inside a segment and in the query string', async () => {
    const { fetchFunction, requests } = fakeFetch(200, json({}));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    await client.call('/anime/k-on..movie?from=../x');

    expect(requests[0]?.url).toBe(
      'http://127.0.0.1:3001/anime/k-on..movie?from=../x',
    );
  });

  it('keeps a protocol-relative-looking path on the configured host', async () => {
    const { fetchFunction, requests } = fakeFetch(200, json({}));
    const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchFunction });

    await client.call('//evil.example/anime');

    expect(new URL(requests[0]?.url ?? '').host).toBe('127.0.0.1:3001');
  });

  it('validates the base URL it is given, like API_BASE_URL', () => {
    expect(() =>
      createApiClient({ baseUrl: 'ftp://127.0.0.1', fetch: hangingFetch }),
    ).toThrow('API_BASE_URL is invalid');
    expect(() =>
      createApiClient({
        baseUrl: 'http://127.0.0.1:3001/',
        fetch: hangingFetch,
      }),
    ).not.toThrow();
  });

  it('throws on programming errors instead of reporting network', async () => {
    const client = createApiClient({ baseUrl: BASE_URL, fetch: hangingFetch });

    await expect(
      client.call('/anime', { method: 'POST', body: { id: BigInt(1) } }),
    ).rejects.toThrow(TypeError);
    await expect(client.call('/anime', { timeoutMs: -1 })).rejects.toThrow(
      'positive integer',
    );
    await expect(client.call('/anime', { timeoutMs: 1.5 })).rejects.toThrow(
      'positive integer',
    );
    expect(() =>
      createApiClient({ baseUrl: BASE_URL, defaultTimeoutMs: 0 }),
    ).toThrow('positive integer');
  });

  it('rethrows Next.js control-flow errors instead of reporting network', async () => {
    const notFoundSignal = captureNotFoundSignal();
    const nextFetch: FetchFunction = () => Promise.reject(notFoundSignal);
    const client = createApiClient({ baseUrl: BASE_URL, fetch: nextFetch });

    await expect(client.call('/anime')).rejects.toBe(notFoundSignal);
  });

  it('maps an empty 200 body to invalid_response', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(200, '').fetchFunction,
    });

    expect(await client.call('/anime')).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200 },
    });
  });

  it('keeps only the contract fields of an error envelope', async () => {
    const leakyEnvelope = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request',
        details: [{ field: 'name', message: 'required', value: 'secret' }],
        stack: 'Error at /srv/app.js:1',
      },
      debug: { databaseUrl: 'postgres://user:password@db' },
    };
    const client = createApiClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch(400, json(leakyEnvelope)).fetchFunction,
    });

    expect(await client.call('/studios')).toEqual({
      ok: false,
      failure: {
        kind: 'api_error',
        status: 400,
        error: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid request',
            details: [{ field: 'name', message: 'required' }],
          },
        },
      },
    });
  });
});

describe('apiClient', () => {
  // apiClient caches its instance in module state; a fresh module per test keeps tests independent.
  async function freshApiClient() {
    vi.resetModules();
    const { apiClient } = await import('./client');
    return apiClient;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the client from API_BASE_URL on first use and reuses it', async () => {
    vi.stubEnv('API_BASE_URL', 'http://api.test:4000/');
    const { fetchFunction, requests } = fakeFetch(
      200,
      json({ status: 'ok', checks: { database: 'up' } }),
    );
    vi.stubGlobal('fetch', fetchFunction);
    const apiClient = await freshApiClient();

    const first = apiClient();
    await first.call('/health');

    expect(requests[0]?.url).toBe('http://api.test:4000/health');
    expect(apiClient()).toBe(first);
  });

  it('throws the configuration message when API_BASE_URL is missing', async () => {
    vi.stubEnv('API_BASE_URL', '');
    const apiClient = await freshApiClient();

    expect(() => apiClient()).toThrow('API_BASE_URL is missing');
  });

  it('throws the configuration message when API_BASE_URL is invalid', async () => {
    vi.stubEnv('API_BASE_URL', 'ftp://127.0.0.1');
    const apiClient = await freshApiClient();

    expect(() => apiClient()).toThrow('API_BASE_URL is invalid');
  });
});
