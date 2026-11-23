// @vitest-environment node
import type {
  ApiErrorCode,
  EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';
import {
  EMAIL_LINK_LANDINGS,
  emailLinkTokenFrom,
  landingOf,
  linkRequestKindOf,
  verifyLinkOutcomeFrom,
  wellFormedAuthToken,
  type LinkRequestKind,
  type VerifyLinkOutcome,
} from './email-link';

const TOKEN = 'Ab3_-'.repeat(8) + 'xyz';
const SESSION = {
  sessionToken: 'S'.repeat(43),
  expiresAt: '2026-12-23T12:00:00.000Z',
};

type CallResult = CredentialCallResult<EmailVerificationConfirmResponse>;
const answered = (data: EmailVerificationConfirmResponse): CallResult => ({
  kind: 'called',
  result: { ok: true, data },
});
const failedWith = (failure: ApiFailure): CallResult => ({
  kind: 'called',
  result: { ok: false, failure },
});
const apiError = (
  status: number,
  code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>,
) => failedWith({ kind: 'api_error', status, error: { error: { code, message: 'x' } } });

describe('emailLinkTokenFrom', () => {
  it('keeps exactly one value of 43 base64url characters', () => {
    expect(TOKEN).toHaveLength(43);
    expect(emailLinkTokenFrom(new URLSearchParams({ token: TOKEN }))).toBe(
      TOKEN,
    );
  });

  it.each([
    ['no token', ''],
    ['an empty token', 'token='],
    ['the same token repeated', `token=${TOKEN}&token=${TOKEN}`],
    ['two different tokens', `token=${TOKEN}&token=${'B'.repeat(43)}`],
    ['42 characters', `token=${TOKEN.slice(1)}`],
    ['44 characters', `token=${TOKEN}A`],
    ['padding', `token=${TOKEN.slice(1)}=`],
    ['a "+" (standard base64, a space once decoded)', `token=${TOKEN.slice(1)}+`],
    ['a "/"', `token=${TOKEN.slice(1)}/`],
    ['a trailing CR/LF', `token=${TOKEN.slice(2)}%0D%0A`],
    ['another parameter name', `Token=${TOKEN}`],
  ])('refuses %s', (_name, query) => {
    expect(emailLinkTokenFrom(new URLSearchParams(query))).toBeUndefined();
  });
});

describe('linkRequestKindOf', () => {
  const opened = (init: RequestInit = {}) =>
    new Request('https://beta.otakuleague.com/auth/verify', init);
  const navigation = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

  it.each<[string, RequestInit, LinkRequestKind]>([
    ['a GET with no Fetch Metadata', {}, 'navigate'],
    ['a top-level navigation', { headers: navigation }, 'navigate'],
    ['another Purpose', { headers: { purpose: 'preview' } }, 'navigate'],
    ['HEAD', { method: 'HEAD' }, 'other'],
    ['POST', { method: 'POST' }, 'other'],
    ['a no-cors subresource', { headers: { 'sec-fetch-mode': 'no-cors' } }, 'other'],
    ['an iframe', { headers: { 'sec-fetch-dest': 'iframe' } }, 'other'],
    [
      'a speculation-rules prefetch',
      { headers: { ...navigation, 'sec-purpose': 'prefetch' } },
      'speculative',
    ],
    [
      'a prerender',
      { headers: { ...navigation, 'sec-purpose': 'prefetch;prerender' } },
      'speculative',
    ],
    ['an empty Sec-Purpose', { headers: { 'sec-purpose': '' } }, 'speculative'],
    [
      'a <link rel=prefetch> (a subresource with Sec-Purpose)',
      {
        headers: {
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-dest': 'empty',
          'sec-purpose': 'prefetch',
        },
      },
      'speculative',
    ],
    ['HEAD with Sec-Purpose', { method: 'HEAD', headers: { 'sec-purpose': 'prefetch' } }, 'speculative'],
    ['Purpose: prefetch', { headers: { purpose: 'prefetch' } }, 'speculative'],
    ['Purpose: Prefetch, any case', { headers: { purpose: 'Prefetch' } }, 'speculative'],
  ])('reads %s as %s', (_name, init, expected) => {
    expect(linkRequestKindOf(opened(init))).toBe(expected);
  });
});

describe('wellFormedAuthToken', () => {
  it.each([
    [TOKEN, TOKEN],
    [undefined, undefined],
    ['', undefined],
    [`${TOKEN.slice(1)};`, undefined],
    [` ${TOKEN}`, undefined],
  ])('reads %j as %j', (value, expected) => {
    expect(wellFormedAuthToken(value)).toBe(expected);
  });
});

describe('verifyLinkOutcomeFrom (the outcome table of the addendum)', () => {
  it.each<[string, CallResult, VerifyLinkOutcome]>([
    [
      '200 verified with a session',
      answered({ outcome: 'verified', session: SESSION }),
      { kind: 'signed_in', sessionToken: SESSION.sessionToken },
    ],
    [
      '200 verified with session null',
      answered({ outcome: 'verified', session: null }),
      { kind: 'confirmed' },
    ],
    [
      '200 already_verified',
      answered({ outcome: 'already_verified' }),
      { kind: 'confirmed' },
    ],
    [
      '200 confirmation_required',
      answered({ outcome: 'confirmation_required' }),
      { kind: 'confirmation_required' },
    ],
    ['400 AUTH_TOKEN_INVALID', apiError(400, 'AUTH_TOKEN_INVALID'), { kind: 'expired' }],
    ['429', apiError(429, 'TOO_MANY_REQUESTS'), { kind: 'try_again' }],
    ['503 AUTH_BUSY', apiError(503, 'AUTH_BUSY'), { kind: 'try_again' }],
    ['401 INVALID_CREDENTIALS', apiError(401, 'INVALID_CREDENTIALS'), { kind: 'try_again' }],
    ['403 INTERNAL_KEY_REQUIRED', apiError(403, 'INTERNAL_KEY_REQUIRED'), { kind: 'try_again' }],
    ['500', apiError(500, 'INTERNAL_ERROR'), { kind: 'try_again' }],
    [
      'a 400 VALIDATION_FAILED',
      failedWith({
        kind: 'api_error',
        status: 400,
        error: { error: { code: 'VALIDATION_FAILED', message: 'x', details: [] } },
      }),
      { kind: 'try_again' },
    ],
    ['a body off contract', failedWith({ kind: 'invalid_response', status: 200 }), { kind: 'try_again' }],
    ['a network failure', failedWith({ kind: 'network' }), { kind: 'try_again' }],
    ['a timeout', failedWith({ kind: 'timeout' }), { kind: 'try_again' }],
    ['a preview refusal', { kind: 'refused', reason: 'preview_deployment' }, { kind: 'try_again' }],
    ['an unknown client IP', { kind: 'refused', reason: 'client_ip_unknown' }, { kind: 'try_again' }],
    ['a forwarded action', { kind: 'refused', reason: 'action_forwarded' }, { kind: 'try_again' }],
  ])('maps %s', (_name, callResult, expected) => {
    expect(verifyLinkOutcomeFrom(callResult)).toEqual(expected);
  });
});

describe('landingOf', () => {
  it('sends each outcome to its own constant, and the six landings are distinct relative paths', () => {
    expect(
      (
        [
          { kind: 'signed_in', sessionToken: SESSION.sessionToken },
          { kind: 'confirmation_required' },
          { kind: 'confirmed' },
          { kind: 'expired' },
          { kind: 'try_again' },
        ] as const
      ).map(landingOf),
    ).toEqual([
      '/auth/verify/signed-in',
      '/auth/verify/password',
      '/auth/verify/confirmed',
      '/auth/verify/expired',
      '/auth/verify/try-again',
    ]);
    const landings = Object.values(EMAIL_LINK_LANDINGS);
    expect(new Set(landings).size).toBe(6);
    expect(landings.filter((path) => !/^\/auth(\/verify\/[a-z-]+)?$/.test(path))).toEqual([]);
  });
});
