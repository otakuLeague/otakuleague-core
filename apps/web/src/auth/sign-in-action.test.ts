// @vitest-environment node
import { isSignInResponse, type ApiErrorCode } from '@otakuleague/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { SESSION_COOKIE_MAX_AGE_SECONDS } from './auth-cookies';
import { signInAction } from './sign-in-action';
import type { SignInFormState } from './sign-in-form-state';

const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  jar: new Map<string, string>(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
  deleteSession: vi.fn(),
  sessionCall: vi.fn(),
  reportClientIpUnknown: vi.fn(),
  reportAuthCallFault: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('./credential-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./credential-call')>()),
  credentialCall: mocks.credentialCall,
}));
vi.mock('next/headers', () => ({
  cookies: () => {
    const get = (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    };
    return Promise.resolve({ get, set: mocks.setCookie });
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
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportClientIpUnknown: mocks.reportClientIpUnknown,
  reportAuthCallFault: mocks.reportAuthCallFault,
}));

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT (test sentinel)');
const IDENTIFIER = ' Farouk@Example.com';
const PASSWORD = 'never-echo-this-password';
const TOKEN = 'A'.repeat(43);
const OLD_TOKEN = 'B'.repeat(43);
const IDLE: SignInFormState = { kind: 'idle' };

const signInForm = (extra: Readonly<Record<string, string | Blob>> = {}) => {
  const formData = new FormData();
  const fields = { identifier: IDENTIFIER, password: PASSWORD, ...extra };
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
};
const failedWith = (failure: ApiFailure) => ({
  kind: 'called',
  result: { ok: false, failure },
});
const apiError = (
  status: number,
  code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>,
  retryAfterSeconds?: number,
) =>
  failedWith({
    kind: 'api_error',
    status,
    error: { error: { code, message: 'x' } },
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
const CLIENT_IP_UNKNOWN = { kind: 'refused', reason: 'client_ip_unknown' };
const UNAVAILABLE = { kind: 'unavailable' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', 'https://beta.otakuleague.com');
  mocks.requestHeaders = new Headers({
    origin: 'https://beta.otakuleague.com',
  });
  mocks.jar = new Map([['__Host-ol_session', OLD_TOKEN]]);
  mocks.deleteSession.mockResolvedValue(undefined);
  mocks.credentialCall.mockResolvedValue({
    kind: 'called',
    result: {
      ok: true,
      data: { sessionToken: TOKEN, expiresAt: '2026-12-20T12:00:00.000Z' },
    },
  });
  mocks.redirect.mockImplementation(() => {
    throw REDIRECT_SIGNAL;
  });
});

describe('signInAction', () => {
  it('makes one call, sets the session cookie, then replaces the history entry with next; the redirect signal propagates', async () => {
    await expect(
      signInAction(IDLE, signInForm({ next: '/my-list?tab=watching' })),
    ).rejects.toBe(REDIRECT_SIGNAL);
    expect(mocks.credentialCall.mock.calls).toEqual([
      [
        {
          path: '/auth/sign-in',
          body: { identifier: IDENTIFIER, password: PASSWORD },
          isExpectedBody: isSignInResponse,
        },
      ],
    ]);
    expect(mocks.setCookie.mock.calls).toEqual([
      [
        '__Host-ol_session',
        TOKEN,
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
        },
      ],
    ]);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/my-list?tab=watching', 'replace'],
    ]);
    expect(mocks.deleteSession.mock.calls).toEqual([[OLD_TOKEN]]);
    const order = [
      mocks.credentialCall,
      mocks.deleteSession,
      mocks.setCookie,
      mocks.redirect,
    ].map((mock) => mock.mock.invocationCallOrder[0] ?? 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
  });

  it.each([
    ['no old cookie', []],
    ['a malformed old cookie', [['__Host-ol_session', `Bearer ${OLD_TOKEN}`]]],
  ] as const)(
    'with %s, deletes no session and still signs in',
    async (_, jar) => {
      mocks.jar = new Map(jar);
      await expect(signInAction(IDLE, signInForm())).rejects.toBe(
        REDIRECT_SIGNAL,
      );
      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect(mocks.setCookie.mock.calls[0]?.[1]).toBe(TOKEN);
    },
  );

  it.each([
    ['throws', () => mocks.sessionCall.mockRejectedValue(new Error('no key'))],
    [
      'times out',
      () =>
        mocks.sessionCall.mockResolvedValue(failedWith({ kind: 'timeout' })),
    ],
  ])(
    'still sets the new cookie and redirects when the real old-session delete %s',
    async (_, arrange) => {
      const actual =
        await vi.importActual<typeof import('./delete-session')>(
          './delete-session',
        );
      mocks.deleteSession.mockImplementation(actual.deleteSession);
      arrange();
      await expect(signInAction(IDLE, signInForm())).rejects.toBe(
        REDIRECT_SIGNAL,
      );
      expect(mocks.sessionCall).toHaveBeenCalledTimes(1);
      expect(mocks.setCookie.mock.calls[0]?.[1]).toBe(TOKEN);
      expect(mocks.redirect.mock.calls).toEqual([['/', 'replace']]);
    },
  );

  it.each<Readonly<Record<string, string | Blob>>>([
    { next: '//evil.com/my-list' },
    { next: '/\\evil.com' },
    { next: 'https://evil.com/' },
    { next: new File(['/my-list'], 'next.txt') },
    {},
  ])('redirects home for a hostile or missing next: %o', async (extra) => {
    await expect(signInAction(IDLE, signInForm(extra))).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.redirect.mock.calls).toEqual([['/', 'replace']]);
  });

  // A fault is reported; the visitor's input, an outage and a refusal are not (ADR 0015 N9).
  it.each([
    [apiError(401, 'INVALID_CREDENTIALS'), { kind: 'invalid_credentials' }],
    [apiError(429, 'AUTH_BUSY', 1), { kind: 'busy' }],
    [
      apiError(429, 'TOO_MANY_REQUESTS', 120),
      { kind: 'rate_limited', retryAfterSeconds: 120 },
    ],
    [
      apiError(403, 'INTERNAL_KEY_REQUIRED'),
      UNAVAILABLE,
      'internal_key_refused',
    ],
    [
      failedWith({ kind: 'invalid_response', status: 200 }),
      UNAVAILABLE,
      'invalid_response',
    ],
    [failedWith({ kind: 'invalid_response', status: 502 }), UNAVAILABLE],
    [failedWith({ kind: 'timeout' }), UNAVAILABLE],
    [{ kind: 'refused', reason: 'action_forwarded' }, UNAVAILABLE],
    [CLIENT_IP_UNKNOWN, UNAVAILABLE],
  ])(
    'returns %o as %o, reporting fault %s: no cookie, no redirect, the old session kept',
    async (callResult, formState, fault?: string) => {
      mocks.credentialCall.mockResolvedValue(callResult);
      const state = await signInAction(IDLE, signInForm({ next: '/my-list' }));
      expect(state).toEqual(formState);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect(mocks.reportClientIpUnknown.mock.calls).toEqual(
        callResult === CLIENT_IP_UNKNOWN ? [['sign-in']] : [],
      );
      expect(mocks.reportAuthCallFault.mock.calls).toEqual(
        fault === undefined ? [] : [['sign-in', fault]],
      );
    },
  );

  it.each(['preview', 'development', ''])(
    'is off with VERCEL_ENV=%o before reading the form or calling the API',
    async (vercelEnv) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      const notAForm = 'never read' as unknown as FormData;
      expect(await signInAction(IDLE, notAForm)).toEqual({
        kind: 'off_on_preview',
      });
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
    },
  );

  it.each([[{}], [{ origin: 'null' }], [{ origin: 'https://evil.com' }]])(
    'refuses a request with Origin %o (login CSRF) before reading the form or calling the API',
    async (requestHeaders) => {
      mocks.requestHeaders = new Headers(requestHeaders);
      const notAForm = 'never read' as unknown as FormData;
      expect(await signInAction(IDLE, notAForm)).toEqual({
        kind: 'unavailable',
      });
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );

  it.each([
    signInForm({ password: '' }),
    signInForm({ identifier: 'i'.repeat(255) }),
    'identifier=a&password=b' as unknown as FormData,
  ])(
    'answers invalid_credentials to %o without calling the API or echoing a field',
    async (formData) => {
      const state = await signInAction(IDLE, formData);
      expect(state).toEqual({ kind: 'invalid_credentials' });
      expect(JSON.stringify(state)).not.toMatch(/farouk|never-echo/i);
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
    },
  );

  it('ignores a forged previous state', async () => {
    mocks.credentialCall.mockResolvedValue(
      apiError(401, 'INVALID_CREDENTIALS'),
    );
    const forged = { kind: 'signed_in', sessionToken: TOKEN };
    expect(
      await signInAction(forged as unknown as SignInFormState, signInForm()),
    ).toEqual({ kind: 'invalid_credentials' });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('lets a configuration error from the credential call propagate, with no cookie', async () => {
    const configurationError = new Error('Invalid web configuration');
    mocks.credentialCall.mockRejectedValue(configurationError);
    await expect(signInAction(IDLE, signInForm())).rejects.toBe(
      configurationError,
    );
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
});
