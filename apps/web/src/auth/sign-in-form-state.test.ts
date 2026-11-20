// @vitest-environment node
import type { ApiErrorCode, SignInResponse } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';
import {
  readSignInFields,
  SIGN_IN_IDENTIFIER_MAX,
  SIGN_IN_PASSWORD_RAW_MAX,
  signInOutcomeFrom,
} from './sign-in-form-state';

const formWith = (fields: Readonly<Record<string, string | Blob>>) => {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
};
const aFile = () => new File(['secret'], 'password.txt');

const failedWith = (
  failure: ApiFailure,
): CredentialCallResult<SignInResponse> => ({
  kind: 'called',
  result: { ok: false, failure },
});
/** Always a 429 with Retry-After, so only the code can decide the state. */
const apiError = (code: ApiErrorCode, retryAfterSeconds?: number) =>
  failedWith({
    kind: 'api_error',
    status: 429,
    error:
      code === 'VALIDATION_FAILED'
        ? { error: { code, message: 'x', details: [] } }
        : { error: { code, message: 'x' } },
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
const failed = (formState: object) => ({ kind: 'failed', formState });

describe('readSignInFields', () => {
  it('uses the API limits', () => {
    expect([SIGN_IN_IDENTIFIER_MAX, SIGN_IN_PASSWORD_RAW_MAX]).toEqual([
      254, 1024,
    ]);
  });

  it.each([
    { identifier: 'farouk', password: 'hunter22' },
    { identifier: ' Farouk@Example.COM ', password: '  Pass Word ' },
    { identifier: 'i'.repeat(254), password: 'p'.repeat(1024) },
  ])('keeps $identifier exactly as typed', (fields) => {
    expect(readSignInFields(formWith(fields))).toEqual(fields);
  });

  it.each<Readonly<Record<string, string | Blob>>>([
    { identifier: 'i'.repeat(255), password: 'p' },
    { identifier: 'i', password: 'p'.repeat(1025) },
    { identifier: '', password: 'p' },
    { identifier: 'i', password: '' },
    { password: 'p' },
    { identifier: 'i' },
    { identifier: 'i', password: aFile() },
    { identifier: aFile(), password: 'p' },
  ])('refuses a field too long, empty, missing or a file: %o', (fields) => {
    expect(readSignInFields(formWith(fields))).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    'identifier=i&password=p',
    { identifier: 'i', password: 'p' },
    new URLSearchParams('identifier=i&password=p'),
  ])('refuses %o, which is not a FormData', (value) => {
    expect(readSignInFields(value)).toBeUndefined();
  });
});

describe('signInOutcomeFrom', () => {
  it('signs in with the token of a 200', () => {
    const sessionToken = 'A'.repeat(43);
    const expiresAt = '2026-12-20T12:00:00.000Z';
    expect(
      signInOutcomeFrom({
        kind: 'called',
        result: { ok: true, data: { sessionToken, expiresAt } },
      }),
    ).toEqual({ kind: 'signed_in', sessionToken });
  });

  it.each([
    ['INVALID_CREDENTIALS', 'invalid_credentials'],
    ['VALIDATION_FAILED', 'invalid_credentials'],
    ['AUTH_BUSY', 'busy'],
    ['BAD_REQUEST', 'unavailable'],
    ['INTERNAL_KEY_REQUIRED', 'unavailable'],
    ['UNAUTHORIZED', 'unavailable'],
    ['INTERNAL_ERROR', 'unavailable'],
    ['SERVICE_UNAVAILABLE', 'unavailable'],
  ] as const)('maps %s to %s, with no Retry-After', (code, kind) => {
    expect(signInOutcomeFrom(apiError(code, 1))).toEqual(failed({ kind }));
  });

  it.each([
    [120, 120],
    [undefined, null],
  ])(
    'maps TOO_MANY_REQUESTS with Retry-After %o to rate_limited %o',
    (seconds, retryAfterSeconds) => {
      expect(signInOutcomeFrom(apiError('TOO_MANY_REQUESTS', seconds))).toEqual(
        failed({ kind: 'rate_limited', retryAfterSeconds }),
      );
    },
  );

  it.each([
    [{ kind: 'refused', reason: 'preview_deployment' }, 'off_on_preview'],
    [{ kind: 'refused', reason: 'client_ip_unknown' }, 'unavailable'],
    [failedWith({ kind: 'network' }), 'unavailable'],
    [failedWith({ kind: 'timeout' }), 'unavailable'],
    [failedWith({ kind: 'invalid_response', status: 200 }), 'unavailable'],
  ] as const)('maps %o to %s', (callResult, kind) => {
    expect(signInOutcomeFrom(callResult)).toEqual(failed({ kind }));
  });
});
