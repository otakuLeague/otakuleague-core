// @vitest-environment node
import { isSignUpResponse, type ApiErrorCode } from '@otakuleague/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { SIGN_UP_COOKIE_MAX_AGE_SECONDS } from './auth-cookies';
import { signUpAction } from './sign-up-action';
import type { SignUpFormState } from './sign-up-form-state';

const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  readCookie: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
  reportClientIpUnknown: vi.fn(),
  reportAuthCallFault: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('./credential-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./credential-call')>()),
  credentialCall: mocks.credentialCall,
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: mocks.readCookie,
      getAll: mocks.readCookie,
      has: mocks.readCookie,
      set: mocks.setCookie,
    }),
  headers: () => Promise.resolve(mocks.requestHeaders),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: mocks.redirect,
}));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportClientIpUnknown: mocks.reportClientIpUnknown,
  reportAuthCallFault: mocks.reportAuthCallFault,
}));

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT (test sentinel)');
const TYPED = {
  username: 'Frieren_99',
  email: ' Frieren@Example.COM ',
  password: 'never-echo-this-password',
};
const BINDING = 'aZ09_-'.repeat(7) + 'x';
const IDLE: SignUpFormState = { kind: 'idle' };
const UNAVAILABLE = { kind: 'unavailable' };
const CLIENT_IP_UNKNOWN = { kind: 'refused', reason: 'client_ip_unknown' };
const NOT_A_FORM = 'never read' as unknown as FormData;

const signUpForm = (extra: Readonly<Record<string, string>> = {}) => {
  const formData = new FormData();
  for (const [name, value] of Object.entries({ ...TYPED, ...extra })) {
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
const expectNothingWritten = () => {
  expect(mocks.setCookie).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', 'https://beta.otakuleague.com');
  mocks.requestHeaders = new Headers({
    origin: 'https://beta.otakuleague.com',
  });
  mocks.credentialCall.mockResolvedValue({
    kind: 'called',
    result: { ok: true, data: { bindingToken: BINDING } },
  });
  mocks.redirect.mockImplementation(() => {
    throw REDIRECT_SIGNAL;
  });
});

afterEach(() => {
  // Never a cookie read: not the session, not an older binding (ADR 0015 Addendum 1f-v decision 6).
  expect(mocks.readCookie).not.toHaveBeenCalled();
});

describe('signUpAction', () => {
  it.each([
    ['https', 'https://beta.otakuleague.com', '__Host-', true],
    ['loopback http, off Vercel', 'http://localhost:3000', '', false],
  ] as const)(
    'on %s makes one call, sets ol_signup then ol_flash, then replaces the history entry with /auth/check-email',
    async (_, origin, prefix, secure) => {
      if (!secure) {
        vi.stubEnv('VERCEL', undefined);
      }
      vi.stubEnv('WEB_PUBLIC_URL', origin);
      mocks.requestHeaders = new Headers({ origin });
      await expect(signUpAction(IDLE, signUpForm())).rejects.toBe(
        REDIRECT_SIGNAL,
      );
      expect(mocks.credentialCall.mock.calls).toEqual([
        [
          {
            path: '/auth/sign-up',
            body: TYPED,
            isExpectedBody: isSignUpResponse,
          },
        ],
      ]);
      const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
      expect(mocks.setCookie.mock.calls).toEqual([
        [
          `${prefix}ol_signup`,
          BINDING,
          { ...options, maxAge: SIGN_UP_COOKIE_MAX_AGE_SECONDS },
        ],
        [`${prefix}ol_flash`, 'frieren@example.com', { ...options, maxAge: 600 }],
      ]);
      expect(mocks.redirect.mock.calls).toEqual([
        ['/auth/check-email', 'replace'],
      ]);
      const order = [mocks.credentialCall, mocks.setCookie, mocks.redirect].map(
        (mock) => mock.mock.invocationCallOrder[0] ?? 0,
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );

  // A fault is reported; the visitor's input, a closed sign-up, an outage and a refusal are not.
  it.each([
    [apiError(409, 'USERNAME_TAKEN'), { kind: 'username_taken' }],
    [apiError(403, 'SIGN_UP_CLOSED'), { kind: 'sign_up_closed' }],
    [
      apiError(429, 'TOO_MANY_REQUESTS', 3600),
      { kind: 'rate_limited', retryAfterSeconds: 3600 },
    ],
    [
      apiError(403, 'INTERNAL_KEY_REQUIRED'),
      UNAVAILABLE,
      'internal_key_refused',
    ],
    [
      failedWith({ kind: 'invalid_response', status: 202 }),
      UNAVAILABLE,
      'invalid_response',
    ],
    [failedWith({ kind: 'network' }), UNAVAILABLE],
    [CLIENT_IP_UNKNOWN, UNAVAILABLE],
  ])(
    'returns %o as %o, reporting fault %s, with no cookie and no redirect',
    async (callResult, formState, fault?: string) => {
      mocks.credentialCall.mockResolvedValue(callResult);
      const state = await signUpAction(IDLE, signUpForm());
      expect(state).toEqual(formState);
      expect(JSON.stringify(state)).not.toMatch(/frieren|never-echo/i);
      expectNothingWritten();
      expect(mocks.reportClientIpUnknown.mock.calls).toEqual(
        callResult === CLIENT_IP_UNKNOWN ? [['sign-up']] : [],
      );
      expect(mocks.reportAuthCallFault.mock.calls).toEqual(
        fault === undefined ? [] : [['sign-up', fault]],
      );
    },
  );

  it('is off on a preview before reading WEB_PUBLIC_URL, the Origin, the form or the API', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('WEB_PUBLIC_URL', undefined);
    expect(await signUpAction(IDLE, NOT_A_FORM)).toEqual({
      kind: 'off_on_preview',
    });
    expect(mocks.credentialCall).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it.each([
    [{}],
    [{ origin: 'null' }],
    [{ origin: 'https://evil.example' }],
    [{ origin: 'http://beta.otakuleague.com' }],
  ])(
    'refuses Origin %o (sign-up CSRF) before reading the form, unreported',
    async (requestHeaders) => {
      mocks.requestHeaders = new Headers(requestHeaders);
      expect(await signUpAction(IDLE, NOT_A_FORM)).toEqual(UNAVAILABLE);
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expectNothingWritten();
      expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );

  it.each([
    [signUpForm({ email: '' }), ['email']],
    [signUpForm({ username: 'a b', password: '' }), ['username', 'password']],
    [NOT_A_FORM, ['username', 'email', 'password']],
  ])(
    'answers invalid_fields to %o naming %o, with no call and no echo',
    async (formData, fields) => {
      const state = await signUpAction(IDLE, formData);
      expect(state).toEqual({ kind: 'invalid_fields', fields });
      expect(JSON.stringify(state)).not.toMatch(/frieren|never-echo/i);
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expectNothingWritten();
    },
  );

  it('ignores a forged previous state', async () => {
    mocks.credentialCall.mockResolvedValue(apiError(409, 'USERNAME_TAKEN'));
    const forged = { kind: 'accepted', bindingToken: BINDING };
    expect(
      await signUpAction(forged as unknown as SignUpFormState, signUpForm()),
    ).toEqual({ kind: 'username_taken' });
    expectNothingWritten();
  });

  it.each([
    ['WEB_PUBLIC_URL is missing', () => vi.stubEnv('WEB_PUBLIC_URL', undefined)],
    [
      'the credential call throws',
      () => mocks.credentialCall.mockRejectedValue(new Error('no key')),
    ],
  ])(
    'lets a configuration error propagate when %s, with no cookie',
    async (_, arrange) => {
      arrange();
      const thrown = await signUpAction(IDLE, signUpForm()).catch(
        (error: unknown) => error,
      );
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBe(REDIRECT_SIGNAL);
      expectNothingWritten();
    },
  );
});
