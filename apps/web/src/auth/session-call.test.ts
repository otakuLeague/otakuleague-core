// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchFunction } from '../api/client';
import type { SessionToken } from '../api/session-token';

// No `headers` export: sessionCall must never read the request (no client IP).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));

const KEY = 'fake-internal-api-key-for-tests-only-0123456789';
const TOKEN = `${'aZ09_-'.repeat(7)}x`;
const SESSION = TOKEN as SessionToken;

/** The real module over the real apiClient() and a stubbed fetch, with a fresh module graph. */
async function sessionModuleWith(env: Record<string, string | undefined>) {
  const requests: [string, RequestInit | undefined][] = [];
  const fetchFunction: FetchFunction = (input, init) => {
    requests.push([input instanceof Request ? input.url : input.toString(), init]);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const production = { VERCEL: '1', VERCEL_ENV: 'production', INTERNAL_API_KEY: KEY };
  for (const [name, value] of Object.entries({ ...production, ...env })) {
    vi.stubEnv(name, value);
  }
  vi.stubEnv('API_BASE_URL', 'https://api.otakuleague.test');
  vi.stubGlobal('fetch', fetchFunction);
  vi.resetModules();
  return { ...(await import('./session-call')), requests };
}

afterEach(() => {
  jar.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sessionCall', () => {
  it.each(['GET', 'POST'] as const)(
    'sends one uncached %s with the key and the Bearer, no client IP, no body, within the timeout',
    async (method) => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const { sessionCall, requests } = await sessionModuleWith({});

      const path = '/auth/sign-out';
      const outcome = await sessionCall({ session: SESSION, path, method, timeoutMs: 2000 });

      expect(outcome).toEqual({ kind: 'called', result: { ok: true, data: undefined } });
      const [url, init] = requests[0] ?? [];
      const sent = new Headers(init?.headers);
      expect([requests.length, url]).toEqual([1, `https://api.otakuleague.test${path}`]);
      expect([init?.method, init?.cache, init?.body]).toEqual([method, 'no-store', undefined]);
      expect(sent.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(sent.get('x-internal-api-key')).toBe(KEY);
      expect(sent.has('x-client-ip')).toBe(false);
      expect(timeout.mock.calls).toEqual([[2000]]);
    },
  );

  it.each(['preview', 'development', undefined])(
    'refuses on Vercel with VERCEL_ENV=%j before any request, without a key',
    async (vercelEnv) => {
      const env = { VERCEL_ENV: vercelEnv, INTERNAL_API_KEY: '' };
      const { sessionCall, requests } = await sessionModuleWith(env);

      expect(await sessionCall({ session: SESSION, path: '/me' })).toEqual({
        kind: 'refused',
        reason: 'preview_deployment',
      });
      expect(requests).toEqual([]);
    },
  );

  it('throws without INTERNAL_API_KEY before any request, never naming the token', async () => {
    const env = { INTERNAL_API_KEY: '' };
    const { sessionCall, requests } = await sessionModuleWith(env);

    const error = await sessionCall({ session: SESSION, path: '/me' }).catch(
      (cause: unknown) => cause,
    );
    expect(String(error)).toMatch(/INTERNAL_API_KEY is not set/);
    expect(`${String(error)} ${(error as Error).stack}`).not.toContain(TOKEN);
    expect(requests).toEqual([]);
  });
});

describe('readSessionToken', () => {
  const HTTPS = { origin: 'https://beta.otakuleague.com', isHttps: true };
  const HTTP = { origin: 'http://localhost:3000', isHttps: false };
  const HOST = '__Host-ol_session';

  it.each([
    ['__Host- on https', HTTPS, HOST, TOKEN, TOKEN],
    ['plain on http', HTTP, 'ol_session', TOKEN, TOKEN],
    ['never a plain cookie on https', HTTPS, 'ol_session', TOKEN, undefined],
    ['never __Host- on http', HTTP, HOST, TOKEN, undefined],
    ['nothing one character short', HTTPS, HOST, TOKEN.slice(1), undefined],
    ['nothing with a Bearer prefix', HTTPS, HOST, `Bearer ${TOKEN}`, undefined],
    ['nothing with a CR/LF', HTTPS, HOST, `${TOKEN.slice(2)}\r\n`, undefined],
  ])('reads %s', async (_, webPublicUrl, name, value, expected) => {
    jar.set(name, value);
    const { readSessionToken } = await sessionModuleWith({});

    expect(await readSessionToken(webPublicUrl)).toBe(expected);
  });
});
