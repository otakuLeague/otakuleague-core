import {
  PASSWORD_RAW_MAX,
  type EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';

/** What the password page's form shows: `idle` before the first submit. Never holds the password. */
export type ConfirmEmailFormState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'wrong_password' }
  | {
      readonly kind: 'rate_limited';
      readonly retryAfterSeconds: number | null;
    }
  | { readonly kind: 'busy' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'off_on_preview' };

export type ConfirmEmailFailureState = Exclude<
  ConfirmEmailFormState,
  { readonly kind: 'idle' }
>;

/**
 * One confirm call with the sign-up password (ADR 0015 Addendum 1f-vi decision 9): the API answered
 * for the token for good (`confirmed`, `expired`), or the page shows a state and the token stays.
 */
export type ConfirmEmailOutcome =
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'failed'; readonly formState: ConfirmEmailFailureState };

/**
 * The password exactly as typed, or nothing when it is missing, empty, a file or longer than
 * `PASSWORD_RAW_MAX` (the API's own raw bound); no request goes out then. A forged action call can
 * pass anything, so the argument is checked to be a FormData first.
 */
export function readConfirmEmailPassword(formData: unknown): string | undefined {
  if (!(formData instanceof FormData)) {
    return undefined;
  }
  const password = formData.get('password');
  return typeof password === 'string' &&
    password.length > 0 &&
    password.length <= PASSWORD_RAW_MAX
    ? password
    : undefined;
}

/**
 * By `outcome` and error code only. `verified` (never with a session here: no binding is sent, and a
 * session would be ignored) and `already_verified` are `confirmed`. `confirmation_required` cannot
 * answer a call that carries a password, so it is `unavailable`, like anything else unexpected.
 */
export function confirmEmailOutcomeFrom(
  callResult: CredentialCallResult<EmailVerificationConfirmResponse>,
): ConfirmEmailOutcome {
  if (callResult.kind === 'refused') {
    return failed(
      callResult.reason === 'preview_deployment'
        ? { kind: 'off_on_preview' }
        : { kind: 'unavailable' },
    );
  }
  const { result } = callResult;
  if (!result.ok) {
    return failureOutcomeFrom(result.failure);
  }
  switch (result.data.outcome) {
    case 'verified':
    case 'already_verified':
      return { kind: 'confirmed' };
    case 'confirmation_required':
      return failed({ kind: 'unavailable' });
  }
}

function failed(formState: ConfirmEmailFailureState): ConfirmEmailOutcome {
  return { kind: 'failed', formState };
}

/** Nothing is retried: `AUTH_BUSY` drops its Retry-After, as sign-in does (ADR 0020). */
function failureOutcomeFrom(failure: ApiFailure): ConfirmEmailOutcome {
  if (failure.kind !== 'api_error') {
    return failed({ kind: 'unavailable' });
  }
  switch (failure.error.error.code) {
    case 'AUTH_TOKEN_INVALID':
      return { kind: 'expired' };
    case 'INVALID_CREDENTIALS':
    case 'VALIDATION_FAILED':
      return failed({ kind: 'wrong_password' });
    case 'AUTH_BUSY':
      return failed({ kind: 'busy' });
    case 'TOO_MANY_REQUESTS':
      return failed({
        kind: 'rate_limited',
        retryAfterSeconds: failure.retryAfterSeconds ?? null,
      });
    default:
      return failed({ kind: 'unavailable' });
  }
}
