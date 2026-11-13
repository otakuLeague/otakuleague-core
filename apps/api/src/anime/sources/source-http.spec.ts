import { gzipSync } from 'node:zlib';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';
import {
  requestJson,
  retryAfterMs,
  type SourceHttpOptions,
} from './source-http';
import { SourceUnavailableError, UnusableAnswerError } from './source.types';

type Reply =
  | {
      status: number;
      headers?: Record<string, string>;
      body?: string | Buffer;
      /** Sent without Content-Length. */
      chunked?: true;
    }
  | { status: number; headers: Record<string, string>; noBody: true }
  | 'hang';

/** A local stand-in for a source: answers each request with the next reply. */
async function fakeSource(
  replies: Reply[],
): Promise<{ url: string; calls: () => number }> {
  let calls = 0;
  server = createServer((_request, response) => {
    const reply = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    if (reply === undefined || reply === 'hang') return;
    if ('noBody' in reply) {
      response.writeHead(reply.status, reply.headers).flushHeaders();
      return;
    }
    const body = reply.body ?? '{}';
    const headers =
      reply.chunked === true
        ? reply.headers
        : {
            'Content-Length': String(Buffer.byteLength(body)),
            ...reply.headers,
          };
    response.writeHead(reply.status, headers).end(body);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, calls: () => calls };
}

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) =>
    server ? server.close(resolve) : resolve(undefined),
  );
  server = undefined;
});

function options(
  overrides: Partial<SourceHttpOptions> = {},
): SourceHttpOptions {
  return {
    source: 'jikan',
    limiter: new RateLimiter(0),
    timeoutMs: 1_000,
    maxRetryAfterMs: 5_000,
    coolDownMs: 60_000,
    maxQueueMs: 5_000,
    ...overrides,
  };
}

describe('retryAfterMs', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');

  it.each([
    ['30', 30_000],
    ['0', 0],
    ['Thu, 15 Oct 2026 10:00:45 GMT', 45_000],
    ['soon', 60_000],
    [null, 60_000],
  ])('%j -> %j ms', (header, expected) => {
    expect(retryAfterMs(header, now)).toBe(expected);
  });
});

describe('requestJson', () => {
  it('returns the JSON body of a 200 and of a 404', async () => {
    const source = await fakeSource([
      { status: 200, body: '{"data":1}' },
      { status: 404, body: '{"error":"nope"}' },
    ]);

    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 200,
      body: { data: 1 },
    });
    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 404,
      body: { error: 'nope' },
    });
  });

  it('waits for Retry-After on a 429 and tries once more', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '0' } },
      { status: 200, body: '{"ok":true}' },
    ]);

    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(source.calls()).toBe(2);
  });

  it('stays down until a long Retry-After ends, even with a short cool-down', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '3600' } },
    ]);
    const shared = options({ coolDownMs: 0 });

    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'rate limited for 3600000 ms',
    );
    // Without the longer cool-down this call would sleep for an hour in the queue.
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'cooling down',
    );
    expect(source.calls()).toBe(1);
  });

  it('refuses a call that would wait in the queue longer than maxQueueMs', async () => {
    const source = await fakeSource([{ status: 200, body: '{}' }]);
    const shared = options({
      limiter: new RateLimiter(60_000),
      maxQueueMs: 100,
    });

    await requestJson(source.url, {}, shared);
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'queue full',
    );
    expect(source.calls()).toBe(1);
  });

  it('says whether a request had already reached the source when the call is refused', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '0' } },
    ]);
    const shared = options({
      limiter: new RateLimiter(60_000),
      maxQueueMs: 100,
    });

    const retried = await requestJson(source.url, {}, shared).catch(
      (error: unknown) => error,
    );
    const refused = await requestJson(source.url, {}, shared).catch(
      (error: unknown) => error,
    );

    expect(retried).toMatchObject({ reason: 'queue full', requestSent: true });
    expect(refused).toMatchObject({ reason: 'queue full', requestSent: false });
    expect(source.calls()).toBe(1);
  });

  it('gives up at once when Retry-After is longer than it may wait', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '120' } },
    ]);

    await expect(requestJson(source.url, {}, options())).rejects.toThrow(
      'jikan unavailable: rate limited for 120000 ms',
    );
    expect(source.calls()).toBe(1);
  });

  it('fails on a 5xx, then fails fast during the cool-down without calling again', async () => {
    const source = await fakeSource([{ status: 503 }]);
    const shared = options();

    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'HTTP 503',
    );
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'cooling down',
    );
    expect(source.calls()).toBe(1);
  });

  it('turns a timeout into SourceUnavailableError', async () => {
    const source = await fakeSource(['hang']);

    await expect(
      requestJson(source.url, {}, options({ timeoutMs: 100 })),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('turns a body that is not JSON into SourceUnavailableError', async () => {
    const source = await fakeSource([
      { status: 200, body: '<html>maintenance</html>' },
    ]);

    await expect(requestJson(source.url, {}, options())).rejects.toThrow(
      'not JSON',
    );
  });

  it('turns an empty body into the not-JSON failure', async () => {
    const source = await fakeSource([{ status: 200, body: '' }]);

    await expect(requestJson(source.url, {}, options())).rejects.toThrow(
      'not JSON',
    );
  });
});

describe('requestJson body limit', () => {
  const limit = 64;
  const small = (overrides: Partial<SourceHttpOptions> = {}) =>
    options({ maxBodyBytes: limit, ...overrides });
  /** A JSON string of exactly `bytes` bytes. */
  const json = (bytes: number) => `"${'a'.repeat(bytes - 2)}"`;

  it('accepts a body of exactly the limit, with Content-Length', async () => {
    const source = await fakeSource([{ status: 200, body: json(limit) }]);

    await expect(requestJson(source.url, {}, small())).resolves.toMatchObject({
      status: 200,
    });
  });

  it('accepts a body of exactly the limit, chunked (no Content-Length)', async () => {
    const source = await fakeSource([
      {
        status: 200,
        chunked: true,
        body: json(limit),
      },
    ]);

    await expect(requestJson(source.url, {}, small())).resolves.toMatchObject({
      status: 200,
    });
  });

  it('rejects one byte over the limit, with Content-Length', async () => {
    const source = await fakeSource([{ status: 200, body: json(limit + 1) }]);

    await expect(requestJson(source.url, {}, small())).rejects.toThrow(
      'jikan unavailable: response body too large',
    );
  });

  it('rejects one byte over the limit, chunked', async () => {
    const source = await fakeSource([
      {
        status: 200,
        chunked: true,
        body: json(limit + 1),
      },
    ]);

    await expect(requestJson(source.url, {}, small())).rejects.toThrow(
      'response body too large',
    );
  });

  it('rejects on Content-Length alone, without waiting for the body', async () => {
    const source = await fakeSource([
      {
        status: 200,
        headers: { 'Content-Length': String(limit + 1) },
        noBody: true,
      },
    ]);
    const started = performance.now();

    await expect(
      requestJson(source.url, {}, small({ timeoutMs: 5_000 })),
    ).rejects.toThrow('response body too large');
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('counts bytes, not characters', async () => {
    // 40 characters, 80 bytes.
    const body = JSON.stringify('\u00e9'.repeat(39));
    const source = await fakeSource([{ status: 200, body }]);

    await expect(requestJson(source.url, {}, small())).rejects.toThrow(
      'response body too large',
    );
  });

  it('rejects a gzip body that decodes over the limit, without a cool-down', async () => {
    const source = await fakeSource([
      {
        status: 200,
        headers: { 'Content-Encoding': 'gzip' },
        body: gzipSync(json(limit * 10)),
      },
    ]);
    const shared = small();

    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'response body too large',
    );
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'response body too large',
    );
    expect(source.calls()).toBe(2);
  });

  it('rejects an oversized 404 body too', async () => {
    const source = await fakeSource([{ status: 404, body: json(limit + 1) }]);

    await expect(requestJson(source.url, {}, small())).rejects.toThrow(
      'response body too large',
    );
  });

  it('throws UnusableAnswerError and does not mark the source down', async () => {
    const source = await fakeSource([{ status: 200, body: json(limit + 1) }]);
    const shared = small();

    const error: unknown = await requestJson(source.url, {}, shared).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UnusableAnswerError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'response body too large',
    );
    expect(source.calls()).toBe(2);
  });
});
