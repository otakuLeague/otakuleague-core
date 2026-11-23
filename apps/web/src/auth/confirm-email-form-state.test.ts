// @vitest-environment node
import type {
  ApiErrorCode,
  EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import {
  confirmEmailOutcomeFrom,
  readConfirmEmailPassword,
} from './confirm-email-form-state';
import type { CredentialCallResult } from './credential-call';

const formWith = (fields: Readonly<Record<string, string | Blob>>) => {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
};

type ConfirmCall = CredentialCallResult<EmailVerificationConfirmResponse>;
const answered = (data: EmailVerificationConfirmResponse): ConfirmCall => ({
  kind: 'called',
  result: { ok: true, data },
});
const failedWith = (failure: ApiFailure): ConfirmCall => ({
  kind: 'called',
  result: { ok: false, failure },
});
/** Always a 429 with Retry-After, so only the code can decide the state. */
const apiError = (
  code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>,
  retryAfterSeconds?: number,
) =>
  failedWith({
    kind: 'api_error',
    status: 429,
    error: { error: { code, message: 'x' } },
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
const validationFailed = (...fields: readonly string[]) =>
  failedWith({
    kind: 'api_error',
    status: 400,
    error: {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'x',
        details: fields.map((field) => ({ field, message: 'x' })),
      },
    },
  });
const failed = (formState: object) => ({ kind: 'failed', formState });
const UNAVAILABLE = failed({ kind: 'unavailable' });

describe('readConfirmEmailPassword', () => {
  it.each(['p', '  Pass Word ', 'p'.repeat(1024)])(
    'keeps %o exactly as typed',
    (password) => {
      expect(readConfirmEmailPassword(formWith({ password }))).toBe(password);
    },
  );

  it.each<[string, unknown]>([
    ['an empty password', formWith({ password: '' })],
    ['one unit over the bound', formWith({ password: 'p'.repeat(1025) })],
    ['no password field', formWith({ identifier: 'farouk' })],
    ['a file', formWith({ password: new File(['secret'], 'password.txt') })],
    ['a string body', 'password=hunter22'],
    ['a plain object', { password: 'hunter22' }],
    ['nothing', undefined],
  ])('reads nothing from %s', (_, formData) => {
    expect(readConfirmEmailPassword(formData)).toBeUndefined();
  });
});

describe('confirmEmailOutcomeFrom', () => {
  it.each<[string, ConfirmCall, object]>([
    [
      'verified with no session',
      answered({ outcome: 'verified', session: null }),
      { kind: 'confirmed' },
    ],
    // Never a sign-in on this path, even if the API broke its contract and sent one.
    [
      'verified with a session',
      answered({
        outcome: 'verified',
        session: {
          sessionToken: 'A'.repeat(43),
          expiresAt: '2026-12-20T12:00:00.000Z',
        },
      }),
      { kind: 'confirmed' },
    ],
    [
      'already_verified',
      answered({ outcome: 'already_verified' }),
      { kind: 'confirmed' },
    ],
    // Cannot answer a call that carries a password: unexpected, so the safe state.
    [
      'confirmation_required',
      answered({ outcome: 'confirmation_required' }),
      UNAVAILABLE,
    ],
    ['AUTH_TOKEN_INVALID', apiError('AUTH_TOKEN_INVALID'), { kind: 'expired' }],
    [
      'INVALID_CREDENTIALS',
      apiError('INVALID_CREDENTIALS'),
      failed({ kind: 'wrong_password' }),
    ],
    [
      'VALIDATION_FAILED naming the password',
      validationFailed('token', 'password'),
      failed({ kind: 'wrong_password' }),
    ],
    ['VALIDATION_FAILED naming the token', validationFailed('token'), UNAVAILABLE],
    ['VALIDATION_FAILED naming nothing', validationFailed(), UNAVAILABLE],
    ['AUTH_BUSY', apiError('AUTH_BUSY', 1), failed({ kind: 'busy' })],
    [
      'TOO_MANY_REQUESTS with Retry-After',
      apiError('TOO_MANY_REQUESTS', 900),
      failed({ kind: 'rate_limited', retryAfterSeconds: 900 }),
    ],
    [
      'TOO_MANY_REQUESTS without Retry-After',
      apiError('TOO_MANY_REQUESTS'),
      failed({ kind: 'rate_limited', retryAfterSeconds: null }),
    ],
    ['UNAUTHORIZED', apiError('UNAUTHORIZED'), UNAVAILABLE],
    ['INTERNAL_KEY_REQUIRED', apiError('INTERNAL_KEY_REQUIRED'), UNAVAILABLE],
    ['SERVICE_UNAVAILABLE', apiError('SERVICE_UNAVAILABLE'), UNAVAILABLE],
    ['a network failure', failedWith({ kind: 'network' }), UNAVAILABLE],
    ['a timeout', failedWith({ kind: 'timeout' }), UNAVAILABLE],
    [
      'an off-contract body',
      failedWith({ kind: 'invalid_response', status: 200 }),
      UNAVAILABLE,
    ],
    [
      'a preview refusal',
      { kind: 'refused', reason: 'preview_deployment' },
      failed({ kind: 'off_on_preview' }),
    ],
    [
      'an unknown client IP',
      { kind: 'refused', reason: 'client_ip_unknown' },
      UNAVAILABLE,
    ],
    [
      'a forwarded action',
      { kind: 'refused', reason: 'action_forwarded' },
      UNAVAILABLE,
    ],
  ])('maps %s', (_, callResult, outcome) => {
    expect(confirmEmailOutcomeFrom(callResult)).toEqual(outcome);
  });
});
