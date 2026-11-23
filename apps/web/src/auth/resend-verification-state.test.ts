// @vitest-environment node
import type {
  ApiErrorCode,
  EmailVerificationResendResponse,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';
import { resendVerificationStateFrom } from './resend-verification-state';

type ResendCall = CredentialCallResult<EmailVerificationResendResponse>;
const failedWith = (failure: ApiFailure): ResendCall => ({
  kind: 'called',
  result: { ok: false, failure },
});
/** Always a 429, so only the code can decide the state. */
const apiError = (code: ApiErrorCode, retryAfterSeconds?: number) =>
  failedWith({
    kind: 'api_error',
    status: 429,
    error: {
      error:
        code === 'VALIDATION_FAILED'
          ? { code, message: 'x', details: [{ field: 'email', message: 'x' }] }
          : { code, message: 'x' },
    },
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
const refused = (
  reason: Extract<ResendCall, { kind: 'refused' }>['reason'],
): ResendCall => ({ kind: 'refused', reason });

describe('resendVerificationStateFrom', () => {
  it.each<[string, ResendCall, object]>([
    [
      'a 202',
      { kind: 'called', result: { ok: true, data: {} } },
      { kind: 'sent' },
    ],
    ['SIGN_UP_CLOSED', apiError('SIGN_UP_CLOSED'), { kind: 'sign_up_closed' }],
    [
      'TOO_MANY_REQUESTS with Retry-After',
      apiError('TOO_MANY_REQUESTS', 3600),
      { kind: 'rate_limited', retryAfterSeconds: 3600 },
    ],
    [
      'TOO_MANY_REQUESTS without Retry-After',
      apiError('TOO_MANY_REQUESTS'),
      { kind: 'rate_limited', retryAfterSeconds: null },
    ],
    [
      'a preview refusal',
      refused('preview_deployment'),
      { kind: 'off_on_preview' },
    ],
  ])('maps %s', (_, callResult, state) => {
    expect(resendVerificationStateFrom(callResult)).toEqual(state);
  });

  // No `busy`: the route hashes nothing, so AUTH_BUSY is off contract (and never retried).
  it.each<[string, ResendCall]>([
    ['AUTH_BUSY', apiError('AUTH_BUSY', 1)],
    ['VALIDATION_FAILED', apiError('VALIDATION_FAILED')],
    ['UNAUTHORIZED', apiError('UNAUTHORIZED')],
    ['INTERNAL_KEY_REQUIRED', apiError('INTERNAL_KEY_REQUIRED')],
    ['SERVICE_UNAVAILABLE', apiError('SERVICE_UNAVAILABLE')],
    ['a network failure', failedWith({ kind: 'network' })],
    ['a timeout', failedWith({ kind: 'timeout' })],
    [
      'a body off contract',
      failedWith({ kind: 'invalid_response', status: 202 }),
    ],
    ['an unknown client IP', refused('client_ip_unknown')],
    ['a forwarded action', refused('action_forwarded')],
  ])('maps %s to unavailable', (_, callResult) => {
    expect(resendVerificationStateFrom(callResult)).toEqual({
      kind: 'unavailable',
    });
  });
});
