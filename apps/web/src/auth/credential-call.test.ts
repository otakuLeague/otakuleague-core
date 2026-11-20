// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchFunction } from '../api/client';

/** The incoming request seen by `headers()`, and how often it was read. */
const incoming = vi.hoisted(() => ({ headers: new Headers(), reads: 0 }));
vi.mock('next/headers', () => ({
  headers: () => {
    incoming.reads += 1;
    return Promise.resolve(incoming.headers);
  },
}));

const KEY = 'fake-internal-api-key-for-tests-only-0123456789';
const VISITOR_IP = '203.0.113.7';
const PASSWORD = 'never-echo-this-password';
const PRODUCTION = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  WEB_PUBLIC_URL: 'https://beta.otakuleague.com',
  API_BASE_URL: 'https://api.otakuleague.test',
  INTERNAL_API_KEY: KEY,
};

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

const isSignedIn = (body: unknown): body is { readonly signedIn: true } =>
  typeof body === 'object' && body !== null && 'signedIn' in body;

const answer = (status: number, body: unknown, headers = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers }));

/** credentialCall over the real apiClient() and a stubbed global fetch, with a fresh module graph. */
async function credentialCallWith(
  env: Readonly<Record<string, string | undefined>>,
  respond: () => Promise<Response> = () => answer(200, { signedIn: true }),
) {
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      init,
    });
    return respond();
  };
  for (const [name, value] of Object.entries({ ...PRODUCTION, ...env })) {
    vi.stubEnv(name, value);
  }
  vi.stubGlobal('fetch', fetchFunction);
  vi.resetModules();
  const { credentialCall } = await import('./credential-call');
  const call = () =>
    credentialCall({
      path: '/auth/sign-in',
      body: { identifier: 'farouk', password: PASSWORD },
      isExpectedBody: isSignedIn,
    });
  return { call, requests };
}

/** Fails if a secret or the visitor's IP appears anywhere in `value`. */
function expectNoSecretIn(value: unknown): void {
  const text =
    value instanceof Error
      ? `${value.message} ${value.stack}`
      : JSON.stringify(value);
  for (const secret of [KEY, VISITOR_IP, PASSWORD]) {
    expect(text).not.toContain(secret);
  }
}

describe('credentialCall', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    incoming.headers = new Headers();
    incoming.reads = 0;
  });

  it.each(['preview', 'development', undefined, ''])(
    'refuses on Vercel with VERCEL_ENV=%j before reading the request or calling the API',
    async (vercelEnv) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { call, requests } = await credentialCallWith({
        VERCEL_ENV: vercelEnv,
      });

      expect(await call()).toEqual({
        kind: 'refused',
        reason: 'preview_deployment',
      });
      expect(requests).toEqual([]);
      expect(incoming.reads).toBe(0);
    },
  );

  const OFF_VERCEL = { VERCEL: undefined, VERCEL_ENV: undefined };

  it.each([
    ['production without x-forwarded-for', {}, {}],
    [
      'production with a list',
      { 'x-forwarded-for': `${VISITOR_IP}, 1.2.3.4` },
      {},
    ],
    ['production with text', { 'x-forwarded-for': 'unknown' }, {}],
    ['an https web off Vercel (system variables hidden)', {}, OFF_VERCEL],
  ])('refuses in %s', async (_label, headers, env) => {
    incoming.headers = new Headers(headers);
    const { call, requests } = await credentialCallWith(env);

    expect(await call()).toEqual({
      kind: 'refused',
      reason: 'client_ip_unknown',
    });
    expect(requests).toEqual([]);
  });

  it('sends one uncached POST with the key and the visitor IP in production', async () => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { call, requests } = await credentialCallWith({});

    expect(await call()).toEqual({
      kind: 'called',
      result: { ok: true, data: { signedIn: true } },
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe('https://api.otakuleague.test/auth/sign-in');
    expect(request?.init?.method).toBe('POST');
    expect(request?.init?.cache).toBe('no-store');
    expect(new Headers(request?.init?.headers).get('x-internal-api-key')).toBe(
      KEY,
    );
    expect(new Headers(request?.init?.headers).get('x-client-ip')).toBe(
      VISITOR_IP,
    );
  });

  it('sends loopback off Vercel and ignores a forged x-forwarded-for', async () => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { call, requests } = await credentialCallWith({
      ...OFF_VERCEL,
      WEB_PUBLIC_URL: 'http://localhost:3000',
      API_BASE_URL: 'http://127.0.0.1:3001',
    });

    expect((await call()).kind).toBe('called');
    expect(new Headers(requests[0]?.init?.headers).get('x-client-ip')).toBe(
      '127.0.0.1',
    );
    expect(incoming.reads).toBe(0);
  });

  it.each([
    [
      'no INTERNAL_API_KEY',
      { INTERNAL_API_KEY: '' },
      /INTERNAL_API_KEY is not set/,
    ],
    [
      'an API base URL the key may not go to',
      { API_BASE_URL: 'http://api.otakuleague.test' },
      /neither https nor loopback/,
    ],
    [
      'no WEB_PUBLIC_URL',
      { WEB_PUBLIC_URL: undefined },
      /WEB_PUBLIC_URL is missing/,
    ],
  ])(
    'throws with %s, before any request and without a secret',
    async (_label, env, message) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { call, requests } = await credentialCallWith(env);

      const error: unknown = await call().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toMatch(message);
      expectNoSecretIn(error);
      expect(requests).toEqual([]);
    },
  );

  it.each([
    [
      'a 429 AUTH_BUSY',
      () =>
        answer(
          429,
          { error: { code: 'AUTH_BUSY', message: 'Busy' } },
          { 'retry-after': '30' },
        ),
      {
        kind: 'api_error',
        status: 429,
        error: { error: { code: 'AUTH_BUSY', message: 'Busy' } },
        retryAfterSeconds: 30,
      },
    ],
    [
      'a network failure',
      () => Promise.reject(new TypeError('fetch failed')),
      { kind: 'network' },
    ],
    [
      'a timeout',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
      { kind: 'timeout' },
    ],
  ])(
    'returns %s after exactly one request, never retried',
    async (_label, respond, failure) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { call, requests } = await credentialCallWith({}, respond);

      const outcome = await call();
      expect(outcome).toEqual({
        kind: 'called',
        result: { ok: false, failure },
      });
      expect(requests).toHaveLength(1);
      expectNoSecretIn(outcome);
    },
  );
});
