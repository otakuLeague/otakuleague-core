// @vitest-environment node
import {
  EMAIL_VERIFICATION_LINK,
  isEmailVerificationConfirmResponse,
  scrubErrorEvent,
  type ApiErrorCode,
  type EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import {
  clearedSignUpCookie,
  sessionCookie,
  verifyCookie,
} from './auth-cookies';
import { EMAIL_LINK_LANDINGS, type EmailLinkLanding } from './email-link';
import { verifyEmailLink } from './verify-email-link';
import { parseWebPublicUrl } from './web-public-url';

const mocks = vi.hoisted(() => ({
  credentialCall: vi.fn(),
  jar: new Map<string, string>(),
  reads: [] as string[],
  setCookie: vi.fn(),
  deleteSession: vi.fn(),
  reportClientIpUnknown: vi.fn(),
  reportAuthCallFault: vi.fn(),
}));
vi.mock('./credential-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./credential-call')>()),
  credentialCall: mocks.credentialCall,
}));
vi.mock('next/headers', () => ({
  cookies: () => {
    const get = (name: string) => {
      mocks.reads.push(name);
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    };
    return Promise.resolve({ get, set: mocks.setCookie });
  },
}));
vi.mock('./delete-session', () => ({ deleteSession: mocks.deleteSession }));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportClientIpUnknown: mocks.reportClientIpUnknown,
  reportAuthCallFault: mocks.reportAuthCallFault,
}));

const ORIGIN = 'https://beta.otakuleague.com';
const WEB = parseWebPublicUrl(ORIGIN);
const TOKEN = 'T0k3n_-'.repeat(6) + 'x';
const BINDING = 'B'.repeat(43);
const OLD_SESSION = 'O'.repeat(43);
const NEW_SESSION = 'N'.repeat(43);
const LANDINGS: readonly string[] = Object.values(EMAIL_LINK_LANDINGS);

const linkRequest = (query = `token=${TOKEN}`) =>
  new Request(`${ORIGIN}${EMAIL_VERIFICATION_LINK.path}?${query}`);
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
) =>
  failedWith({
    kind: 'api_error',
    status,
    error: { error: { code, message: 'x' } },
  });
const SIGNED_IN = answered({
  outcome: 'verified',
  session: { sessionToken: NEW_SESSION, expiresAt: '2026-12-23T12:00:00.000Z' },
});

/** N36 but a speculative load: a bodiless 303, three headers, a landing constant, never the token. */
async function expectSeeOther(
  response: Response,
  landing: EmailLinkLanding,
): Promise<void> {
  expect(response.status).toBe(303);
  expect(await response.text()).toBe('');
  expect(Object.fromEntries(response.headers)).toEqual({
    location: landing,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  expect(LANDINGS).toContain(response.headers.get('location'));
}

const confirmBodies = () =>
  mocks.credentialCall.mock.calls.map(([request]: unknown[]) => request);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('WEB_PUBLIC_URL', ORIGIN);
  mocks.reads = [];
  mocks.jar = new Map([
    ['__Host-ol_signup', BINDING],
    ['__Host-ol_session', OLD_SESSION],
  ]);
  mocks.deleteSession.mockResolvedValue(undefined);
  mocks.credentialCall.mockResolvedValue(SIGNED_IN);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyEmailLink: before any call', () => {
  it('on a preview answers /auth with 0 calls and 0 cookie reads or writes', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    await expectSeeOther(await verifyEmailLink(linkRequest()), '/auth');
    expect(mocks.credentialCall).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([]);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it.each<[string, RequestInit]>([
    ['HEAD', { method: 'HEAD' }],
    ['an image tag', { headers: { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' } }],
    ['a script fetch', { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } }],
    ['an iframe', { headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' } }],
    ['a mode alone that is not navigate', { headers: { 'sec-fetch-mode': 'no-cors' } }],
    ['a destination alone that is not document', { headers: { 'sec-fetch-dest': 'image' } }],
  ])(
    'answers %s with try-again, 0 cookie reads and 0 calls (the token stays unspent)',
    async (_name, init) => {
      const response = await verifyEmailLink(
        new Request(linkRequest().url, init),
      );

      await expectSeeOther(response, '/auth/verify/try-again');
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.reads).toEqual([]);
      expect(mocks.setCookie).not.toHaveBeenCalled();
    },
  );

  // Chrome serves a prefetched 303 as the later click (checked in Chrome 153, vi-b): a speculative
  // load gets nothing it could reuse, so the click reaches the handler as a real navigation.
  it.each<[string, Record<string, string>]>([
    [
      'a speculation-rules prefetch',
      { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-purpose': 'prefetch' },
    ],
    ['a prerender', { 'sec-purpose': 'prefetch;prerender' }],
    ['a <link rel=prefetch>', { 'sec-fetch-dest': 'empty', 'sec-purpose': 'prefetch' }],
    ['a legacy prefetch', { purpose: 'Prefetch' }],
  ])(
    'answers %s with a bodiless 503, no Location, 0 cookie reads and 0 calls',
    async (_name, headers) => {
      const response = await verifyEmailLink(
        new Request(linkRequest().url, { headers }),
      );

      expect(response.status).toBe(503);
      expect(await response.text()).toBe('');
      expect(Object.fromEntries(response.headers)).toEqual({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.reads).toEqual([]);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );

  // Order: preview first, then the speculative branch before the token, any read or any call.
  it('answers a speculative load on a preview with the preview 303 to /auth', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const prefetch = new Request(linkRequest().url, {
      headers: { 'sec-purpose': 'prefetch' },
    });

    await expectSeeOther(await verifyEmailLink(prefetch), '/auth');
    expect(mocks.credentialCall).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([]);
  });

  it('answers a speculative load with a malformed token with the 503, never expired', async () => {
    const prefetch = new Request(linkRequest(`token=${TOKEN}A`).url, {
      headers: { 'sec-purpose': 'prefetch' },
    });
    const response = await verifyEmailLink(prefetch);

    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('');
    expect(mocks.credentialCall).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([]);
  });

  it.each<[string, Record<string, string>]>([
    [
      'a click from a mail (cross-site top-level navigation)',
      {
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-user': '?1',
      },
    ],
    ['a browser with no Fetch Metadata', {}],
  ])('lets %s through to one call', async (_name, headers) => {
    await verifyEmailLink(new Request(linkRequest().url, { headers }));

    expect(mocks.credentialCall).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no token', ''],
    ['an empty token', 'token='],
    ['a repeated token', `token=${TOKEN}&token=${TOKEN}`],
    ['a short token', `token=${TOKEN.slice(1)}`],
    ['a long token', `token=${TOKEN}${TOKEN}`],
    ['a token with a ";"', `token=${TOKEN.slice(1)}%3B`],
    ['a header injection', `token=${TOKEN.slice(2)}%0D%0A`],
  ])(
    'with %s answers expired, with 0 calls, 0 cookies and no WEB_PUBLIC_URL needed',
    async (_name, query) => {
      vi.stubEnv('WEB_PUBLIC_URL', '');

      await expectSeeOther(
        await verifyEmailLink(linkRequest(query)),
        '/auth/verify/expired',
      );
      expect(mocks.credentialCall).not.toHaveBeenCalled();
      expect(mocks.reads).toEqual([]);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    },
  );
});

describe('verifyEmailLink: the binding', () => {
  it('sends one confirm call with the token and the binding read under the configured name', async () => {
    await verifyEmailLink(linkRequest());

    expect(confirmBodies()).toEqual([
      {
        path: '/auth/email-verification/confirm',
        body: { token: TOKEN, bindingToken: BINDING },
        isExpectedBody: isEmailVerificationConfirmResponse,
      },
    ]);
    expect(mocks.reads).toEqual(['__Host-ol_signup', '__Host-ol_session']);
  });

  it.each([
    ['no binding', []],
    ['a malformed binding', [['__Host-ol_signup', `${BINDING.slice(1)};`]]],
    ['an empty binding', [['__Host-ol_signup', '']]],
    // A sibling host or plain-http page can plant the plain name: never read on https.
    ['only a planted plain ol_signup', [['ol_signup', BINDING]]],
  ] as const)(
    'with %s sends the token alone (never null)',
    async (_name, entries) => {
      mocks.jar = new Map(entries);

      await verifyEmailLink(linkRequest());

      expect(confirmBodies()).toEqual([
        expect.objectContaining({ body: { token: TOKEN } }),
      ]);
    },
  );

  it('on loopback http reads the plain names', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('WEB_PUBLIC_URL', 'http://localhost:3000');
    mocks.jar = new Map([['ol_signup', BINDING]]);

    await verifyEmailLink(linkRequest());

    expect(mocks.reads).toEqual(['ol_signup', 'ol_session']);
    expect(confirmBodies()).toEqual([
      expect.objectContaining({ body: { token: TOKEN, bindingToken: BINDING } }),
    ]);
  });
});

describe('verifyEmailLink: cookies by answer', () => {
  const session = sessionCookie(WEB);
  const clearedBinding = clearedSignUpCookie(WEB);
  const verify = verifyCookie(WEB);

  it('on verified with a session revokes the old session, sets the new one, clears ol_signup, lands signed in', async () => {
    const order: string[] = [];
    mocks.deleteSession.mockImplementation(() => {
      order.push('deleteSession');
      return Promise.resolve();
    });
    mocks.setCookie.mockImplementation((name: string) => {
      order.push(`set ${name}`);
    });

    await expectSeeOther(
      await verifyEmailLink(linkRequest()),
      '/auth/verify/signed-in',
    );
    expect(mocks.deleteSession.mock.calls).toEqual([[OLD_SESSION]]);
    expect(mocks.setCookie.mock.calls).toEqual([
      [session.name, NEW_SESSION, session.options],
      ['__Host-ol_signup', '', clearedBinding.options],
    ]);
    expect(clearedBinding.options).toMatchObject({ maxAge: 0, secure: true });
    expect(order).toEqual([
      'deleteSession',
      'set __Host-ol_session',
      'set __Host-ol_signup',
    ]);
  });

  it.each([
    ['no old session', []],
    ['a malformed old session', [['__Host-ol_session', 'short']]],
    ['only a plain ol_session', [['ol_session', OLD_SESSION]]],
  ] as const)(
    'on verified with a session and %s revokes nothing',
    async (_name, entries) => {
      mocks.jar = new Map([['__Host-ol_signup', BINDING], ...entries]);

      await verifyEmailLink(linkRequest());

      expect(mocks.deleteSession).not.toHaveBeenCalled();
      expect(mocks.setCookie).toHaveBeenCalledTimes(2);
    },
  );

  it('on confirmation_required writes ol_verify with the token only, and lands on the password page', async () => {
    mocks.credentialCall.mockResolvedValue(
      answered({ outcome: 'confirmation_required' }),
    );

    await expectSeeOther(
      await verifyEmailLink(linkRequest()),
      '/auth/verify/password',
    );
    expect(mocks.setCookie.mock.calls).toEqual([
      ['__Host-ol_verify', TOKEN, verify.options],
    ]);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it.each<[string, unknown, EmailLinkLanding]>([
    [
      'verified with session null (wrong browser for the binding)',
      answered({ outcome: 'verified', session: null }),
      '/auth/verify/confirmed',
    ],
    [
      'already_verified (a replayed link)',
      answered({ outcome: 'already_verified' }),
      '/auth/verify/confirmed',
    ],
    [
      '400 AUTH_TOKEN_INVALID (expired, used or forged)',
      apiError(400, 'AUTH_TOKEN_INVALID'),
      '/auth/verify/expired',
    ],
    ['429', apiError(429, 'TOO_MANY_REQUESTS'), '/auth/verify/try-again'],
    ['503 AUTH_BUSY', apiError(503, 'AUTH_BUSY'), '/auth/verify/try-again'],
    ['500', apiError(500, 'INTERNAL_ERROR'), '/auth/verify/try-again'],
    ['a network failure', failedWith({ kind: 'network' }), '/auth/verify/try-again'],
    ['a timeout', failedWith({ kind: 'timeout' }), '/auth/verify/try-again'],
    [
      'a body off contract',
      failedWith({ kind: 'invalid_response', status: 200 }),
      '/auth/verify/try-again',
    ],
    [
      'an unknown client IP',
      { kind: 'refused', reason: 'client_ip_unknown' },
      '/auth/verify/try-again',
    ],
  ])(
    'on %s writes no cookie and revokes nothing',
    async (_name, callResult, landing) => {
      mocks.credentialCall.mockResolvedValue(callResult);

      await expectSeeOther(await verifyEmailLink(linkRequest()), landing);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.deleteSession).not.toHaveBeenCalled();
    },
  );
});

describe('verifyEmailLink: reports and failures', () => {
  it.each([
    ['400 AUTH_TOKEN_INVALID', apiError(400, 'AUTH_TOKEN_INVALID')],
    ['401', apiError(401, 'INVALID_CREDENTIALS')],
    ['429', apiError(429, 'TOO_MANY_REQUESTS')],
    ['503', apiError(503, 'AUTH_BUSY')],
    ['a network failure', failedWith({ kind: 'network' })],
    ['a forwarded action', { kind: 'refused', reason: 'action_forwarded' }],
  ])('reports nothing on %s', async (_name, callResult) => {
    mocks.credentialCall.mockResolvedValue(callResult);

    await verifyEmailLink(linkRequest());

    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the key refused',
      apiError(403, 'INTERNAL_KEY_REQUIRED'),
      'internal_key_refused',
    ],
    [
      'a body off contract',
      failedWith({ kind: 'invalid_response', status: 200 }),
      'invalid_response',
    ],
  ])('reports %s as email-confirm', async (_name, callResult, fault) => {
    mocks.credentialCall.mockResolvedValue(callResult);

    await expectSeeOther(
      await verifyEmailLink(linkRequest()),
      '/auth/verify/try-again',
    );
    expect(mocks.reportAuthCallFault.mock.calls).toEqual([
      ['email-confirm', fault],
    ]);
  });

  it('reports an unknown client IP with the route only', async () => {
    mocks.credentialCall.mockResolvedValue({
      kind: 'refused',
      reason: 'client_ip_unknown',
    });

    await verifyEmailLink(linkRequest());

    expect(mocks.reportClientIpUnknown.mock.calls).toEqual([['email-confirm']]);
  });

  it.each([
    [
      'a missing WEB_PUBLIC_URL',
      () => vi.stubEnv('WEB_PUBLIC_URL', ''),
    ],
    [
      'a throwing credential call (a missing key)',
      () => mocks.credentialCall.mockRejectedValue(new Error('no key')),
    ],
  ])(
    'turns %s into try-again, reported as configuration, with no cookie',
    async (_name, arrange) => {
      arrange();

      await expectSeeOther(
        await verifyEmailLink(linkRequest()),
        '/auth/verify/try-again',
      );
      expect(mocks.reportAuthCallFault.mock.calls).toEqual([
        ['email-confirm', 'configuration'],
      ]);
      expect(mocks.setCookie).not.toHaveBeenCalled();
    },
  );

  it('lets the prerender stop at request.url through (a build must never bake a landing)', async () => {
    // What Next 16.4.6 throws when a prerendered GET handler reads request.url.
    const signal = Object.assign(
      new Error('Route /auth/verify needs to bail out of prerendering'),
      { digest: 'NEXT_PRERENDER_INTERRUPTED' },
    );
    const request = linkRequest();
    Object.defineProperty(request, 'url', {
      get() {
        throw signal;
      },
    });

    await expect(verifyEmailLink(request)).rejects.toBe(signal);
    expect(mocks.reportAuthCallFault).not.toHaveBeenCalled();
    expect(mocks.reportClientIpUnknown).not.toHaveBeenCalled();
    expect(mocks.credentialCall).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([]);
  });

  it('never writes the token to the console or a report, and the scrubber masks it in a request event', async () => {
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    for (const callResult of [
      apiError(403, 'INTERNAL_KEY_REQUIRED'),
      { kind: 'refused', reason: 'client_ip_unknown' },
    ]) {
      mocks.credentialCall.mockResolvedValueOnce(callResult);
      await verifyEmailLink(linkRequest());
    }
    mocks.credentialCall.mockRejectedValueOnce(new Error('no key'));
    await verifyEmailLink(linkRequest());

    const written = JSON.stringify([
      consoleCalls.flatMap((spy) => spy.mock.calls),
      mocks.reportAuthCallFault.mock.calls,
      mocks.reportClientIpUnknown.mock.calls,
    ]);
    expect(written).not.toContain(TOKEN);
    const linkUrl = linkRequest().url;
    const scrubbed = scrubErrorEvent({
      request: {
        url: linkUrl,
        query_string: new URL(linkUrl).search.slice(1),
      },
      breadcrumbs: [{ message: `GET ${linkUrl}` }],
    });
    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  });
});
