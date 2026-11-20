// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signOutAction } from './sign-out-action';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieReads: 0,
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  redirect: vi.fn(),
  deleteSession: vi.fn(),
  sessionCall: vi.fn(),
  report: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('next/headers', () => ({
  cookies: () => {
    mocks.cookieReads += 1;
    const get = (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    };
    return Promise.resolve({
      get,
      set: mocks.setCookie,
      delete: mocks.deleteCookie,
    });
  },
  headers: () => Promise.resolve(mocks.requestHeaders),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: mocks.redirect,
}));
vi.mock('./delete-session', () => ({ deleteSession: mocks.deleteSession }));
vi.mock('./session-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-call')>()),
  sessionCall: mocks.sessionCall,
}));
vi.mock('./report-credential-refusal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./report-credential-refusal')>()),
  reportAuthCallFault: mocks.report,
}));

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT (test sentinel)');
const TOKEN = `${'aZ09_-'.repeat(7)}x`;
const OTHER_TOKEN = 'B'.repeat(43);
const ORIGIN = 'https://beta.otakuleague.com';
const cleared = (name: string, secure: boolean) => [
  name,
  '',
  { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 },
];
const expectNothingDone = () =>
  expect([
    mocks.cookieReads,
    mocks.deleteSession.mock.calls,
    mocks.setCookie.mock.calls,
    mocks.redirect.mock.calls,
  ]).toEqual([0, [], [], []]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', ORIGIN);
  mocks.requestHeaders = new Headers({ origin: ORIGIN });
  mocks.jar = new Map([['__Host-ol_session', TOKEN]]);
  mocks.cookieReads = 0;
  mocks.deleteSession.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation(() => {
    throw REDIRECT_SIGNAL;
  });
});

describe('signOutAction', () => {
  it('deletes the session once, clears the __Host- cookie keeping Secure, then replaces the history entry with home', async () => {
    await expect(signOutAction()).rejects.toBe(REDIRECT_SIGNAL);

    expect(mocks.deleteSession.mock.calls).toEqual([[TOKEN]]);
    expect(mocks.setCookie.mock.calls).toEqual([
      cleared('__Host-ol_session', true),
    ]);
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
    expect(mocks.redirect.mock.calls).toEqual([['/', 'replace']]);
    const order = [mocks.deleteSession, mocks.setCookie, mocks.redirect].map(
      (mock) => mock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('ignores anything a client sends to the action: only the cookie names the session', async () => {
    const forged = new FormData();
    forged.append('session', OTHER_TOKEN);
    const callWithInput = signOutAction as (input: unknown) => Promise<void>;

    await expect(callWithInput(forged)).rejects.toBe(REDIRECT_SIGNAL);
    expect(mocks.deleteSession.mock.calls).toEqual([[TOKEN]]);
  });

  it.each([
    ['throws', new Error('no key'), [['sign-out', 'configuration']]],
    [
      'times out',
      { kind: 'called', result: { ok: false, failure: { kind: 'timeout' } } },
      [],
    ],
  ])(
    'still clears the cookie and redirects when the real delete call %s',
    async (_, outcome, reports) => {
      const actual =
        await vi.importActual<typeof import('./delete-session')>(
          './delete-session',
        );
      mocks.deleteSession.mockImplementation(actual.deleteSession);
      if (outcome instanceof Error) {
        mocks.sessionCall.mockRejectedValue(outcome);
      } else {
        mocks.sessionCall.mockResolvedValue(outcome);
      }

      await expect(signOutAction()).rejects.toBe(REDIRECT_SIGNAL);
      expect(mocks.sessionCall).toHaveBeenCalledTimes(1);
      expect(mocks.setCookie.mock.calls).toEqual([
        cleared('__Host-ol_session', true),
      ]);
      expect(mocks.redirect.mock.calls).toEqual([['/', 'replace']]);
      expect(mocks.report.mock.calls).toEqual(reports);
    },
  );

  it.each([
    ['no cookie', []],
    ['a malformed cookie', [['__Host-ol_session', `Bearer ${TOKEN}`]]],
    [
      'only a plain ol_session, which another page could set',
      [['ol_session', TOKEN]],
    ],
  ] as const)(
    'with %s, deletes nothing, still clears the cookie and redirects',
    async (_, jar) => {
      mocks.jar = new Map(jar);

      await expect(signOutAction()).rejects.toBe(REDIRECT_SIGNAL);
      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect(mocks.setCookie.mock.calls).toEqual([
        cleared('__Host-ol_session', true),
      ]);
      expect(mocks.redirect.mock.calls).toEqual([['/', 'replace']]);
    },
  );

  it('clears the plain ol_session without Secure on an http loopback WEB_PUBLIC_URL', async () => {
    vi.stubEnv('VERCEL', undefined);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('WEB_PUBLIC_URL', 'http://localhost:3000');
    mocks.requestHeaders = new Headers({ origin: 'http://localhost:3000' });
    mocks.jar = new Map([['ol_session', TOKEN]]);

    await expect(signOutAction()).rejects.toBe(REDIRECT_SIGNAL);
    expect(mocks.deleteSession.mock.calls).toEqual([[TOKEN]]);
    expect(mocks.setCookie.mock.calls).toEqual([cleared('ol_session', false)]);
  });

  it.each([[{}], [{ origin: 'null' }], [{ origin: 'https://evil.com' }]])(
    'does nothing for Origin %o (logout CSRF): no cookie read, call, write or redirect',
    async (requestHeaders) => {
      mocks.requestHeaders = new Headers(requestHeaders);

      await expect(signOutAction()).resolves.toBeUndefined();
      expectNothingDone();
    },
  );

  it.each(['preview', 'development', ''])(
    'does nothing with VERCEL_ENV=%o, before WEB_PUBLIC_URL is read',
    async (vercelEnv) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      vi.stubEnv('WEB_PUBLIC_URL', undefined);

      await expect(signOutAction()).resolves.toBeUndefined();
      expectNothingDone();
    },
  );

  it('lets a missing WEB_PUBLIC_URL in production propagate, with no cookie set', async () => {
    vi.stubEnv('WEB_PUBLIC_URL', undefined);

    await expect(signOutAction()).rejects.toThrow('WEB_PUBLIC_URL is missing');
    expectNothingDone();
  });
});
