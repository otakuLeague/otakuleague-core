// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SIGN_IN_BODY = { identifier: 'farouk', password: PASSWORD };
const PRODUCTION = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  WEB_PUBLIC_URL: 'https://beta.otakuleague.com',
  API_BASE_URL: 'https://api.otakuleague.test',
  INTERNAL_API_KEY: KEY,
};

const isSignedIn = (body: unknown): body is { readonly signedIn: true } =>
  typeof body === 'object' && body !== null && 'signedIn' in body;

const answer = (status: number, body: unknown, headers = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
const refused = (reason: string) => ({ kind: 'refused', reason });
const BUSY = { error: { code: 'AUTH_BUSY', message: 'Busy' } };

/** credentialCall over the real apiClient() and a stubbed global fetch, with a fresh module graph. */
async function credentialCallWith(
  env: Readonly<Record<string, string | undefined>>,
  respond: () => Promise<Response> = () => answer(200, { signedIn: true }),
) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
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
      body: SIGN_IN_BODY,
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
  const OFF_VERCEL = { VERCEL: undefined, VERCEL_ENV: undefined };

  beforeEach(() => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    incoming.reads = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['preview', 'development', undefined, ''])(
    'refuses on Vercel with VERCEL_ENV=%j before reading the request, the config or the API',
    async (vercelEnv) => {
      // A preview's config: no WEB_PUBLIC_URL, no production key. Reading either first would throw.
      const { call, requests } = await credentialCallWith({
        VERCEL_ENV: vercelEnv,
        WEB_PUBLIC_URL: undefined,
        INTERNAL_API_KEY: '',
      });

      expect(await call()).toEqual(refused('preview_deployment'));
      expect(requests).toEqual([]);
      expect(incoming.reads).toBe(0);
    },
  );

  // Malformed headers are covered by client-ip.test.ts; these two prove the refusal sends nothing.
  it.each([
    ['without x-forwarded-for', {}, 'client_ip_unknown'],
    [
      'on a forwarded Server Action hop',
      { 'x-forwarded-for': VISITOR_IP, 'x-action-forwarded': '1' },
      'action_forwarded',
    ],
  ])('refuses in production %s', async (_label, headers, reason) => {
    incoming.headers = new Headers(headers);
    const { call, requests } = await credentialCallWith({});

    expect(await call()).toEqual(refused(reason));
    expect(requests).toEqual([]);
  });

  it('sends one uncached POST with the key, the visitor IP and the body in production', async () => {
    const { call, requests } = await credentialCallWith({});

    expect(await call()).toEqual({
      kind: 'called',
      result: { ok: true, data: { signedIn: true } },
    });
    expect(requests).toHaveLength(1);
    const init = requests[0]?.init;
    const sent = new Headers(init?.headers);
    expect(requests[0]?.url).toBe('https://api.otakuleague.test/auth/sign-in');
    expect([init?.method, init?.cache]).toEqual(['POST', 'no-store']);
    expect(sent.get('x-internal-api-key')).toBe(KEY);
    expect(sent.get('x-client-ip')).toBe(VISITOR_IP);
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toEqual(SIGN_IN_BODY);
  });

  it('sends loopback off Vercel and ignores a forged x-forwarded-for', async () => {
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
      'no WEB_PUBLIC_URL',
      { WEB_PUBLIC_URL: undefined },
      /WEB_PUBLIC_URL is missing/,
    ],
    [
      'an https web off Vercel (system variables hidden)',
      OFF_VERCEL,
      /credential calls off Vercel/,
    ],
  ])(
    'throws with %s, before any request and without a secret',
    async (_label, env, message) => {
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
      () => answer(429, BUSY, { 'retry-after': '30' }),
      { kind: 'api_error', status: 429, error: BUSY, retryAfterSeconds: 30 },
    ],
    [
      'a network failure',
      () => Promise.reject(new TypeError('fetch failed')),
      { kind: 'network' },
    ],
    [
      'a 200 of the wrong shape',
      () => answer(200, {}),
      { kind: 'invalid_response', status: 200 },
    ],
  ])(
    'returns %s after exactly one request, never retried',
    async (_label, respond, failure) => {
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
