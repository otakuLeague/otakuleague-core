// @vitest-environment node
import {
  isEmailVerificationConfirmResponse,
  type ApiErrorCode,
  type EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import { confirmEmailAction } from './confirm-email-action';
import type { ConfirmEmailFormState } from './confirm-email-form-state';

type CookieOptions = { readonly maxAge: number; readonly secure: boolean };

const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  jar: new Map<string, string>(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
  deleteSession: vi.fn(),
  reportClientIpUnknown: vi.fn(),
  reportAuthCallFault: vi.fn(),
  requestHeaders: new Headers(),
}));
vi.mock('./credential-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./credential-call')>()),
  credentialCall: mocks.credentialCall,
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mocks.getCookie, set: mocks.setCookie }),
  headers: () => Promise.resolve(mocks.requestHeaders),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: mocks.redirect,
}));
// Never called on this path: mocked only so a call would show.
vi.mock('./delete-session', () => ({ deleteSession: mocks.deleteSession }));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportClientIpUnknown: mocks.reportClientIpUnknown,
  reportAuthCallFault: mocks.reportAuthCallFault,
}));

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT (test sentinel)');
const PASSWORD = 'never-echo-this-password';
const TOKEN = 'T'.repeat(43);
const SESSION = 'S'.repeat(43);
const IDLE: ConfirmEmailFormState = { kind: 'idle' };
const HTTPS_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};
const CLEARED = ['__Host-ol_verify', '', { ...HTTPS_OPTIONS, maxAge: 0 }];

const passwordForm = (password: string | Blob = PASSWORD) => {
  const formData = new FormData();
  formData.append('password', password);
  return formData;
};
const answered = (data: EmailVerificationConfirmResponse) => ({
  kind: 'called',
  result: { ok: true, data },
});
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

/** Nothing about this request reached the API, the jar or a redirect. */
const expectUntouched = () => {
  expect(mocks.credentialCall).not.toHaveBeenCalled();
  expect(mocks.getCookie).not.toHaveBeenCalled();
  expect(mocks.setCookie).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.deleteSession).not.toHaveBeenCalled();
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
  // A signed-in member opening their link elsewhere: the session must never move.
  mocks.jar = new Map([
    ['__Host-ol_verify', TOKEN],
    ['__Host-ol_session', SESSION],
  ]);
  mocks.getCookie.mockImplementation((name: string) => {
    const value = mocks.jar.get(name);
    return value === undefined ? undefined : { name, value };
  });
  // A browser drops a cookie set with Max-Age=0.
  mocks.setCookie.mockImplementation(
    (name: string, value: string, options: CookieOptions) => {
      if (options.maxAge === 0) {
        mocks.jar.delete(name);
      } else {
        mocks.jar.set(name, value);
      }
    },
  );
  mocks.credentialCall.mockResolvedValue(
    answered({ outcome: 'verified', session: null }),
  );
  mocks.redirect.mockImplementation(() => {
    throw REDIRECT_SIGNAL;
  });
});

describe('confirmEmailAction', () => {
  it('sends the cookie token and the password once, with no binding, clears the token, then lands on confirmed', async () => {
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );

    expect(mocks.credentialCall.mock.calls).toEqual([
      [
        {
          path: '/auth/email-verification/confirm',
          body: { token: TOKEN, password: PASSWORD },
          isExpectedBody: isEmailVerificationConfirmResponse,
        },
      ],
    ]);
    expect(mocks.getCookie.mock.calls).toEqual([['__Host-ol_verify']]);
    expect(mocks.setCookie.mock.calls).toEqual([CLEARED]);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/auth/verify/confirmed', 'replace'],
    ]);
    const order = [
      mocks.getCookie,
      mocks.credentialCall,
      mocks.setCookie,
      mocks.redirect,
    ].map((mock) => mock.mock.invocationCallOrder[0] ?? 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.jar.get('__Host-ol_session')).toBe(SESSION);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
  });

  it.each([
    ['already_verified', answered({ outcome: 'already_verified' })],
    // Off contract here (no binding was sent), and still never a sign-in.
    [
      'verified with a session',
      answered({
        outcome: 'verified',
        session: { sessionToken: 'N'.repeat(43), expiresAt: '2026-12-20T12:00:00.000Z' },
      }),
    ],
  ])('lands %s on confirmed and sets no session', async (_, callResult) => {
    mocks.credentialCall.mockResolvedValue(callResult);
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.setCookie.mock.calls).toEqual([CLEARED]);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/auth/verify/confirmed', 'replace'],
    ]);
    expect(mocks.jar.get('__Host-ol_session')).toBe(SESSION);
  });

  it('clears a dead, used or replayed token and lands on expired', async () => {
    mocks.credentialCall.mockResolvedValue(apiError(400, 'AUTH_TOKEN_INVALID'));
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.setCookie.mock.calls).toEqual([CLEARED]);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/auth/verify/expired', 'replace'],
    ]);
    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
  });

  // The token stays for the next try; the visitor's input, an outage and a refusal are not reported.
  it.each([
    // A wrong password, or a token planted from another account: never a sign-out.
    [apiError(401, 'INVALID_CREDENTIALS'), { kind: 'wrong_password' }],
    [
      apiError(429, 'TOO_MANY_REQUESTS', 900),
      { kind: 'rate_limited', retryAfterSeconds: 900 },
    ],
    [
      apiError(429, 'TOO_MANY_REQUESTS'),
      { kind: 'rate_limited', retryAfterSeconds: null },
    ],
    [apiError(429, 'AUTH_BUSY', 1), { kind: 'busy' }],
    [answered({ outcome: 'confirmation_required' }), UNAVAILABLE],
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
    [apiError(503, 'SERVICE_UNAVAILABLE'), UNAVAILABLE],
    [failedWith({ kind: 'network' }), UNAVAILABLE],
    [failedWith({ kind: 'timeout' }), UNAVAILABLE],
    [{ kind: 'refused', reason: 'action_forwarded' }, UNAVAILABLE],
    [CLIENT_IP_UNKNOWN, UNAVAILABLE],
  ])(
    'returns %o as %o, reporting fault %s: the token kept, no redirect, the session untouched',
    async (callResult, formState, fault?: string) => {
      mocks.credentialCall.mockResolvedValue(callResult);
      const state = await confirmEmailAction(IDLE, passwordForm());

      expect(state).toEqual(formState);
      expect(JSON.stringify(state)).not.toMatch(/T{43}|never-echo/);
      expect(mocks.credentialCall).toHaveBeenCalledTimes(1);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect([...mocks.jar.keys()]).toEqual([
        '__Host-ol_verify',
        '__Host-ol_session',
      ]);
      expect(mocks.reportClientIpUnknown.mock.calls).toEqual(
        callResult === CLIENT_IP_UNKNOWN ? [['email-confirm']] : [],
      );
      expect(mocks.reportAuthCallFault.mock.calls).toEqual(
        fault === undefined ? [] : [['email-confirm', fault]],
      );
    },
  );

  it('sends one call per submit, never a retry: brute force meets the API limit', async () => {
    mocks.credentialCall
      .mockResolvedValueOnce(apiError(401, 'INVALID_CREDENTIALS'))
      .mockResolvedValueOnce(apiError(401, 'INVALID_CREDENTIALS'))
      .mockResolvedValueOnce(apiError(429, 'TOO_MANY_REQUESTS', 3600));
    const states = [];
    for (const guess of ['guess-1', 'guess-2', 'guess-3']) {
      states.push(await confirmEmailAction(IDLE, passwordForm(guess)));
    }
    expect(states).toEqual([
      { kind: 'wrong_password' },
      { kind: 'wrong_password' },
      { kind: 'rate_limited', retryAfterSeconds: 3600 },
    ]);
    expect(mocks.credentialCall).toHaveBeenCalledTimes(3);
    expect(mocks.jar.get('__Host-ol_verify')).toBe(TOKEN);
  });

  it.each([
    ['no token cookie', []],
    ['a token one character short', [['__Host-ol_verify', TOKEN.slice(1)]]],
    ['a token one character long', [['__Host-ol_verify', `${TOKEN}T`]]],
    ['a token outside base64url', [['__Host-ol_verify', `${TOKEN.slice(1)}=`]]],
    ['an empty token', [['__Host-ol_verify', '']]],
    // The plain name is http only: on https a sibling host could have set it.
    ['the token under the plain name', [['ol_verify', TOKEN]]],
  ] as const)(
    'with %s, lands on try-again with 0 calls and writes nothing',
    async (_, jar) => {
      mocks.jar = new Map(jar);
      await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
        REDIRECT_SIGNAL,
      );
      expect(mocks.redirect.mock.calls).toEqual([
        ['/auth/verify/try-again', 'replace'],
      ]);
      expect(mocks.getCookie.mock.calls).toEqual([['__Host-ol_verify']]);
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.setCookie).not.toHaveBeenCalled();
    },
  );

  it('a second submit after a confirmation finds no token: try-again, no second call', async () => {
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.credentialCall).toHaveBeenCalledTimes(1);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/auth/verify/confirmed', 'replace'],
      ['/auth/verify/try-again', 'replace'],
    ]);
  });

  it('two submits in flight each send one call; the API decides, and neither signs in', async () => {
    mocks.credentialCall
      .mockResolvedValueOnce(answered({ outcome: 'verified', session: null }))
      .mockResolvedValueOnce(answered({ outcome: 'already_verified' }));
    const results = await Promise.allSettled([
      confirmEmailAction(IDLE, passwordForm()),
      confirmEmailAction(IDLE, passwordForm()),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(mocks.credentialCall).toHaveBeenCalledTimes(2);
    expect(mocks.redirect.mock.calls).toEqual([
      ['/auth/verify/confirmed', 'replace'],
      ['/auth/verify/confirmed', 'replace'],
    ]);
    expect(mocks.setCookie.mock.calls).toEqual([CLEARED, CLEARED]);
  });

  it('on loopback http reads and clears the plain name, without Secure', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('WEB_PUBLIC_URL', 'http://localhost:3000');
    mocks.requestHeaders = new Headers({ origin: 'http://localhost:3000' });
    mocks.jar = new Map([['ol_verify', TOKEN]]);
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.getCookie.mock.calls).toEqual([['ol_verify']]);
    expect(mocks.setCookie.mock.calls).toEqual([
      ['ol_verify', '', { ...HTTPS_OPTIONS, secure: false, maxAge: 0 }],
    ]);
  });

  it.each(['preview', 'development', ''])(
    'is off with VERCEL_ENV=%o before reading the form, a cookie or calling the API',
    async (vercelEnv) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      const notAForm = 'never read' as unknown as FormData;
      expect(await confirmEmailAction(IDLE, notAForm)).toEqual({
        kind: 'off_on_preview',
      });
      expectUntouched();
    },
  );

  it.each([[{}], [{ origin: 'null' }], [{ origin: 'https://evil.com' }]])(
    'refuses a request with Origin %o (CSRF) before reading the form or a cookie, unreported',
    async (requestHeaders) => {
      mocks.requestHeaders = new Headers(requestHeaders);
      const notAForm = 'never read' as unknown as FormData;
      expect(await confirmEmailAction(IDLE, notAForm)).toEqual(UNAVAILABLE);
      expectUntouched();
      expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an empty password', passwordForm('')],
    ['a password over PASSWORD_RAW_MAX', passwordForm('p'.repeat(1025))],
    ['a file', passwordForm(new File([PASSWORD], 'password.txt'))],
    ['no FormData', 'password=hunter22' as unknown as FormData],
  ])(
    'answers wrong_password to %s before reading a cookie or calling the API',
    async (_, formData) => {
      const state = await confirmEmailAction(IDLE, formData);
      expect(state).toEqual({ kind: 'wrong_password' });
      expect(JSON.stringify(state)).not.toMatch(/never-echo|hunter/);
      expectUntouched();
    },
  );

  it('sends a password of exactly PASSWORD_RAW_MAX units', async () => {
    const longest = 'p'.repeat(1024);
    await expect(confirmEmailAction(IDLE, passwordForm(longest))).rejects.toBe(
      REDIRECT_SIGNAL,
    );
    expect(mocks.credentialCall.mock.calls[0]?.[0]?.body).toEqual({
      token: TOKEN,
      password: longest,
    });
  });

  it('ignores a forged previous state', async () => {
    mocks.credentialCall.mockResolvedValue(apiError(401, 'INVALID_CREDENTIALS'));
    const forged = { kind: 'confirmed' } as unknown as ConfirmEmailFormState;
    expect(await confirmEmailAction(forged, passwordForm())).toEqual({
      kind: 'wrong_password',
    });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('lets a configuration error from the credential call propagate, with no cookie write', async () => {
    const configurationError = new Error('Invalid web configuration');
    mocks.credentialCall.mockRejectedValue(configurationError);
    await expect(confirmEmailAction(IDLE, passwordForm())).rejects.toBe(
      configurationError,
    );
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
