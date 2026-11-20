// @vitest-environment node
import { isSignInResponse, type ApiErrorCode } from '@otakuleague/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { SESSION_COOKIE_MAX_AGE_SECONDS } from './auth-cookies';
import { signInAction } from './sign-in-action';
import type { SignInFormState } from './sign-in-form-state';

const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
  reportClientIpUnknown: vi.fn(),
}));
vi.mock('./credential-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./credential-call')>()),
  credentialCall: mocks.credentialCall,
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ set: mocks.setCookie }),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: mocks.redirect,
}));
vi.mock('./report-credential-refusal', () => ({
  reportClientIpUnknown: mocks.reportClientIpUnknown,
}));

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT (test sentinel)');
const IDENTIFIER = ' Farouk@Example.com';
const PASSWORD = 'never-echo-this-password';
const TOKEN = 'A'.repeat(43);
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
const apiError = (code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>) =>
  failedWith({
    kind: 'api_error',
    status: 401,
    error: { error: { code, message: 'x' } },
  });
const CLIENT_IP_UNKNOWN = { kind: 'refused', reason: 'client_ip_unknown' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', 'https://beta.otakuleague.com');
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
  it('makes one call, sets the session cookie, then redirects to next; the redirect signal propagates', async () => {
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
    expect(mocks.redirect.mock.calls).toEqual([['/my-list?tab=watching']]);
    expect(mocks.setCookie.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
  });

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
    expect(mocks.redirect.mock.calls).toEqual([['/']]);
  });

  it.each([
    [apiError('INVALID_CREDENTIALS'), 'invalid_credentials'],
    [apiError('AUTH_BUSY'), 'busy'],
    [apiError('INTERNAL_KEY_REQUIRED'), 'unavailable'],
    [failedWith({ kind: 'timeout' }), 'unavailable'],
    [CLIENT_IP_UNKNOWN, 'unavailable'],
  ])(
    'returns %o as %s: no cookie, no redirect, nothing typed',
    async (callResult, kind) => {
      mocks.credentialCall.mockResolvedValue(callResult);
      const state = await signInAction(IDLE, signInForm({ next: '/my-list' }));
      expect(state).toEqual({ kind });
      expect(JSON.stringify(state)).not.toMatch(/farouk|never-echo/i);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.reportClientIpUnknown.mock.calls).toEqual(
        callResult === CLIENT_IP_UNKNOWN ? [['sign-in']] : [],
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
    },
  );

  it.each([
    signInForm({ password: '' }),
    signInForm({ identifier: 'i'.repeat(255) }),
    'identifier=a&password=b' as unknown as FormData,
  ])(
    'answers invalid_credentials to %o without calling the API',
    async (formData) => {
      expect(await signInAction(IDLE, formData)).toEqual({
        kind: 'invalid_credentials',
      });
      expect(mocks.credentialCall).not.toHaveBeenCalled();
    },
  );

  it('ignores a forged previous state', async () => {
    mocks.credentialCall.mockResolvedValue(apiError('INVALID_CREDENTIALS'));
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
  });
});
