// @vitest-environment node
import {
  isEmailVerificationResendResponse,
  type ApiErrorCode,
} from '@otakuleague/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { resendVerificationAction } from './resend-verification-action';

// Not mocked: `next/navigation`. A redirect would throw, and every test here expects an answer.
const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  jar: new Map<string, string>(),
  getCookie: vi.fn(),
  // `has`, `getAll`, `set` and `delete`: the action needs none of them.
  otherCookieCall: vi.fn(),
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
      get: mocks.getCookie,
      has: mocks.otherCookieCall,
      getAll: mocks.otherCookieCall,
      set: mocks.otherCookieCall,
      delete: mocks.otherCookieCall,
    }),
  headers: () => Promise.resolve(mocks.requestHeaders),
}));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportClientIpUnknown: mocks.reportClientIpUnknown,
  reportAuthCallFault: mocks.reportAuthCallFault,
}));

const ORIGIN = 'https://beta.otakuleague.com';
const FLASH = '__Host-ol_flash';
const ADDRESS = 'frieren@example.com';
const SESSION = ['__Host-ol_session', 'S'.repeat(43)] as const;
const SENT = { kind: 'called', result: { ok: true, data: {} } };
const failedWith = (failure: ApiFailure) => ({
  kind: 'called',
  result: { ok: false, failure },
});
const apiError = (status: number, code: ApiErrorCode, retryAfter?: number) =>
  failedWith({
    kind: 'api_error',
    status,
    error: {
      error:
        code === 'VALIDATION_FAILED'
          ? { code, message: 'x', details: [] }
          : { code, message: 'x' },
    },
    ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
  });
const CLIENT_IP_UNKNOWN = { kind: 'refused', reason: 'client_ip_unknown' };
const SENT_STATE = { kind: 'sent' };
const UNAVAILABLE = { kind: 'unavailable' };
const RATE_LIMITED = { kind: 'rate_limited', retryAfterSeconds: 3600 };

/** Nothing about this request reached the API, the jar or Sentry. */
const expectUntouched = () =>
  expect([
    mocks.credentialCall.mock.calls,
    mocks.getCookie.mock.calls,
    mocks.otherCookieCall.mock.calls,
    mocks.reportClientIpUnknown.mock.calls,
    mocks.reportAuthCallFault.mock.calls,
  ]).toEqual([[], [], [], [], []]);

/** The flash under its configured name is the one cookie read: never the session, never a write. */
const expectOnlyTheFlashRead = () => {
  expect(mocks.getCookie.mock.calls).toEqual([[FLASH]]);
  expect(mocks.otherCookieCall).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', ORIGIN);
  mocks.requestHeaders = new Headers({ origin: ORIGIN });
  // A signed-in member who also just signed up: the session is never read.
  mocks.jar = new Map([[FLASH, ADDRESS], SESSION]);
  mocks.getCookie.mockImplementation((name: string) => {
    const value = mocks.jar.get(name);
    return value === undefined ? undefined : { name, value };
  });
  mocks.credentialCall.mockResolvedValue(SENT);
});

describe('resendVerificationAction', () => {
  it('sends the flash address once as exactly { email } and answers sent, unreported', async () => {
    expect(await resendVerificationAction()).toEqual(SENT_STATE);

    expect(mocks.credentialCall.mock.calls).toEqual([
      [
        {
          path: '/auth/email-verification/resend',
          body: { email: ADDRESS },
          isExpectedBody: isEmailVerificationResendResponse,
        },
      ],
    ]);
    expectOnlyTheFlashRead();
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
  });

  it('ignores a forged previous state and FormData: only the flash names the address', async () => {
    const forged = new FormData();
    forged.append('email', 'attacker@evil.example');
    const callWithInput = resendVerificationAction as (
      state: unknown,
      input: unknown,
    ) => Promise<unknown>;

    expect(await callWithInput({ kind: 'idle' }, forged)).toEqual(SENT_STATE);
    mocks.jar.delete(FLASH);
    expect(await callWithInput(SENT_STATE, forged)).toEqual({
      kind: 'no_address',
    });
    expect(mocks.credentialCall).toHaveBeenCalledTimes(1);
    expect(mocks.credentialCall.mock.calls).toEqual([
      [expect.objectContaining({ body: { email: ADDRESS } })],
    ]);
  });

  // The API's own answers (400, 403, 429), an outage and a refusal are never reported.
  it.each([
    [apiError(403, 'SIGN_UP_CLOSED'), { kind: 'sign_up_closed' }],
    [apiError(429, 'TOO_MANY_REQUESTS', 3600), RATE_LIMITED],
    [apiError(400, 'VALIDATION_FAILED'), UNAVAILABLE],
    [apiError(503, 'SERVICE_UNAVAILABLE'), UNAVAILABLE],
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
    [failedWith({ kind: 'timeout' }), UNAVAILABLE],
    // A visitor can send `x-action-forwarded`: never reported.
    [{ kind: 'refused', reason: 'action_forwarded' }, UNAVAILABLE],
    [CLIENT_IP_UNKNOWN, UNAVAILABLE],
  ])(
    'returns %o as %o, reporting fault %s, after one call and no write',
    async (callResult, state, fault?: string) => {
      mocks.credentialCall.mockResolvedValue(callResult);
      const answer = await resendVerificationAction();

      expect(answer).toEqual(state);
      expect(JSON.stringify(answer)).not.toContain('frieren');
      expect(mocks.credentialCall).toHaveBeenCalledTimes(1);
      expectOnlyTheFlashRead();
      expect(mocks.reportClientIpUnknown.mock.calls).toEqual(
        callResult === CLIENT_IP_UNKNOWN ? [['email-resend']] : [],
      );
      expect(mocks.reportAuthCallFault.mock.calls).toEqual(
        fault === undefined ? [] : [['email-resend', fault]],
      );
    },
  );

  it('sends one call per submit, never a retry: repeated clicks meet the API limit', async () => {
    mocks.credentialCall
      .mockResolvedValueOnce(SENT)
      .mockResolvedValueOnce(SENT)
      .mockResolvedValueOnce(apiError(429, 'TOO_MANY_REQUESTS', 3600));
    const states = [];
    for (let submit = 0; submit < 3; submit += 1) {
      states.push(await resendVerificationAction());
    }
    expect(states).toEqual([SENT_STATE, SENT_STATE, RATE_LIMITED]);
    expect(mocks.credentialCall).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['no flash', []],
    // The plain name is http only: on https a sibling host could have set it.
    ['the flash under the plain name', [['ol_flash', ADDRESS]]],
    ['a look-alike cookie name', [['__Host-ol_flashy', ADDRESS]]],
    ['capitals', [[FLASH, 'Frieren@example.com']]],
    ['a header break', [[FLASH, 'a@b\r\nBcc: c@d']]],
    ['one unit over IDENTIFIER_MAX', [[FLASH, `f@${'e'.repeat(253)}`]]],
  ] as const)('answers no_address to %s with 0 calls', async (_, jar) => {
    mocks.jar = new Map<string, string>([...jar, SESSION]);
    expect(await resendVerificationAction()).toEqual({ kind: 'no_address' });
    expectOnlyTheFlashRead();
    expect(mocks.credentialCall).not.toHaveBeenCalled();
  });

  it.each(['preview', 'development', ''])(
    'is off with VERCEL_ENV=%o before reading WEB_PUBLIC_URL, a header or a cookie',
    async (vercelEnv) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      vi.stubEnv('WEB_PUBLIC_URL', undefined);
      mocks.requestHeaders = new Headers();
      expect(await resendVerificationAction()).toEqual({
        kind: 'off_on_preview',
      });
      expectUntouched();
    },
  );

  it.each([
    [{}],
    [{ origin: 'null' }],
    [{ origin: 'https://evil.com' }],
    [{ origin: `${ORIGIN}.evil.com` }],
    [{ origin: 'http://beta.otakuleague.com' }],
  ])(
    'refuses a request with Origin %o (CSRF) before reading a cookie, unreported',
    async (requestHeaders) => {
      mocks.requestHeaders = new Headers(requestHeaders);
      expect(await resendVerificationAction()).toEqual(UNAVAILABLE);
      expectUntouched();
    },
  );

  it('lets a missing WEB_PUBLIC_URL throw before a cookie is read', async () => {
    vi.stubEnv('WEB_PUBLIC_URL', undefined);
    await expect(resendVerificationAction()).rejects.toThrow('WEB_PUBLIC_URL');
    expectUntouched();
  });

  it('lets a configuration error from the credential call propagate, with no write', async () => {
    const configurationError = new Error('Invalid web configuration');
    mocks.credentialCall.mockRejectedValue(configurationError);
    await expect(resendVerificationAction()).rejects.toBe(configurationError);
    expectOnlyTheFlashRead();
  });
});
