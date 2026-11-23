import type { EmailVerificationResendResponse } from '@otakuleague/shared-types';
import type { CredentialCallResult } from './credential-call';

/**
 * What "Resend email" shows (ADR 0015 Addendum 1f-vii decision 4): `idle` before the first submit.
 * Never holds an address: every 202 is the one `sent`, whatever was mailed (N41).
 */
export type ResendVerificationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'no_address' }
  | { readonly kind: 'sign_up_closed' }
  | {
      readonly kind: 'rate_limited';
      readonly retryAfterSeconds: number | null;
    }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'off_on_preview' };

/**
 * By status and error code only. No `busy`: the route hashes nothing, so an `AUTH_BUSY` is off
 * contract and `unavailable`, like a 400, a 503, a body off contract or any other refusal.
 */
export function resendVerificationStateFrom(
  callResult: CredentialCallResult<EmailVerificationResendResponse>,
): ResendVerificationState {
  if (callResult.kind === 'refused') {
    return callResult.reason === 'preview_deployment'
      ? { kind: 'off_on_preview' }
      : { kind: 'unavailable' };
  }
  const { result } = callResult;
  if (result.ok) {
    return { kind: 'sent' };
  }
  const { failure } = result;
  if (failure.kind !== 'api_error') {
    return { kind: 'unavailable' };
  }
  switch (failure.error.error.code) {
    case 'SIGN_UP_CLOSED':
      return { kind: 'sign_up_closed' };
    case 'TOO_MANY_REQUESTS':
      return {
        kind: 'rate_limited',
        retryAfterSeconds: failure.retryAfterSeconds ?? null,
      };
    default:
      return { kind: 'unavailable' };
  }
}
