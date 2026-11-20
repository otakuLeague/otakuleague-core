// @vitest-environment node
import { isMeResponse } from '@otakuleague/shared-types';
import { notFound } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { loadViewer } from './load-viewer';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieReads: 0,
  writes: vi.fn(),
  connection: vi.fn(),
  sessionCall: vi.fn(),
  report: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: () => {
    mocks.cookieReads += 1;
    const get = (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    };
    return Promise.resolve({ get, set: mocks.writes, delete: mocks.writes });
  },
}));
vi.mock('next/server', () => ({
  connection: mocks.connection,
  after: vi.fn(),
}));
vi.mock('./session-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-call')>()),
  sessionCall: mocks.sessionCall,
}));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportAuthCallFault: mocks.report,
}));

const TOKEN = `${'aZ09_-'.repeat(7)}x`;
const ME = { id: 'u1', username: 'Frieren_99' };
const called = (result: unknown) => ({ kind: 'called', result });
const failed = (failure: ApiFailure) => called({ ok: false, failure });
const api = (status: number, code: 'UNAUTHORIZED' | 'INTERNAL_KEY_REQUIRED') =>
  failed({
    kind: 'api_error',
    status,
    error: { error: { code, message: 'x' } },
  });
const EXPIRED = api(401, 'UNAUTHORIZED');
const KEY_REFUSED = api(403, 'INTERNAL_KEY_REQUIRED');
const ME_CALL = { session: TOKEN, path: '/me', isExpectedBody: isMeResponse };
const OUT = { kind: 'signed_out' };
const NONE = { kind: 'unavailable' };
const NEXT_SIGNAL: unknown = (() => {
  try {
    notFound();
  } catch (signal) {
    return signal;
  }
})();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', 'https://beta.otakuleague.com');
  mocks.jar = new Map([['__Host-ol_session', TOKEN]]);
  mocks.cookieReads = 0;
  mocks.connection.mockResolvedValue(undefined);
  mocks.sessionCall.mockResolvedValue(called({ ok: true, data: ME }));
});

afterEach(() => {
  // Rendering never writes or deletes a cookie, whatever the outcome.
  expect(mocks.writes).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

describe('loadViewer', () => {
  it('signs a preview out before reading WEB_PUBLIC_URL, the cookie or the API', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('WEB_PUBLIC_URL', undefined);

    expect(await loadViewer()).toEqual(OUT);
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.sessionCall).not.toHaveBeenCalled();
    expect([mocks.cookieReads, mocks.report.mock.calls]).toEqual([0, []]);
  });

  it.each([
    ['no cookie', []],
    ['a malformed cookie', [['__Host-ol_session', `Bearer ${TOKEN}`]]],
  ] as const)('is signed out with %s, after 0 API calls', async (_, jar) => {
    mocks.jar = new Map(jar);

    expect(await loadViewer()).toEqual(OUT);
    expect(mocks.sessionCall).not.toHaveBeenCalled();
  });

  it('is signed in after exactly one GET /me with the cookie and a 2 s timeout', async () => {
    const viewer = await loadViewer();

    expect(viewer).toEqual({ kind: 'signed_in', username: ME.username });
    expect(mocks.sessionCall.mock.calls).toEqual([
      [{ ...ME_CALL, timeoutMs: 2000 }],
    ]);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it.each([
    ['a 401 (expired or replayed)', EXPIRED, OUT, []],
    ['a 403', KEY_REFUSED, NONE, ['internal_key_refused']],
  ])('maps %s and reports only a fault', async (_, outcome, viewer, faults) => {
    mocks.sessionCall.mockResolvedValue(outcome);

    expect(await loadViewer()).toEqual(viewer);
    expect(mocks.report.mock.calls).toEqual(
      faults.map((fault) => ['me', fault]),
    );
  });

  it.each([
    ['no WEB_PUBLIC_URL', () => vi.stubEnv('WEB_PUBLIC_URL', undefined)],
    [
      'a throwing sessionCall',
      () => mocks.sessionCall.mockRejectedValue(new Error('no key')),
    ],
  ])(
    'is unavailable with %s, reported as configuration',
    async (_, arrange) => {
      arrange();

      expect(await loadViewer()).toEqual(NONE);
      expect(mocks.report.mock.calls).toEqual([['me', 'configuration']]);
    },
  );

  it("rethrows Next's control-flow signals unreported, before the config or the cookie", async () => {
    vi.stubEnv('WEB_PUBLIC_URL', undefined);
    mocks.connection.mockRejectedValue(NEXT_SIGNAL);

    await expect(loadViewer()).rejects.toBe(NEXT_SIGNAL);
    expect([mocks.cookieReads, mocks.report.mock.calls]).toEqual([0, []]);
  });
});
