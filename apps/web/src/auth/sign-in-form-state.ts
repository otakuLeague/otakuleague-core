import {
  IDENTIFIER_MAX,
  PASSWORD_RAW_MAX,
  type SignInRequest,
  type SignInResponse,
} from '@otakuleague/shared-types';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';

/** What the sign-in form shows: `idle` before the first submit. Never carries what was typed. */
export type SignInFormState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid_credentials' }
  | {
      readonly kind: 'rate_limited';
      readonly retryAfterSeconds: number | null;
    }
  | { readonly kind: 'busy' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'off_on_preview' };

export type SignInFailureState = Exclude<
  SignInFormState,
  { readonly kind: 'idle' }
>;

export type SignInOutcome =
  | { readonly kind: 'signed_in'; readonly sessionToken: string }
  | { readonly kind: 'failed'; readonly formState: SignInFailureState };

/**
 * Both fields exactly as typed (no trim, no case change: the API matches them itself), or nothing
 * when a field is missing, empty, a file or too long; no request goes out then. A forged action
 * call can pass anything, so the argument is checked to be a FormData first.
 */
export function readSignInFields(formData: unknown): SignInRequest | undefined {
  if (!(formData instanceof FormData)) {
    return undefined;
  }
  const identifier = formData.get('identifier');
  const password = formData.get('password');
  return isFieldWithin(identifier, IDENTIFIER_MAX) &&
    isFieldWithin(password, PASSWORD_RAW_MAX)
    ? { identifier, password }
    : undefined;
}

function isFieldWithin(
  value: FormDataEntryValue | null,
  max: number,
): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * One credential call as the form sees it, by error code only (the API's message is never shown).
 * Nothing is retried: `AUTH_BUSY` drops its Retry-After, since each attempt counts against the
 * visitor's limits (ADR 0020). Anything unexpected is `unavailable`, never a sign-in.
 */
export function signInOutcomeFrom(
  callResult: CredentialCallResult<SignInResponse>,
): SignInOutcome {
  if (callResult.kind === 'refused') {
    return failed(
      callResult.reason === 'preview_deployment'
        ? { kind: 'off_on_preview' }
        : { kind: 'unavailable' },
    );
  }
  const { result } = callResult;
  return result.ok
    ? { kind: 'signed_in', sessionToken: result.data.sessionToken }
    : failed(failureStateFrom(result.failure));
}

function failed(formState: SignInFailureState): SignInOutcome {
  return { kind: 'failed', formState };
}

function failureStateFrom(failure: ApiFailure): SignInFailureState {
  if (failure.kind !== 'api_error') {
    return { kind: 'unavailable' };
  }
  switch (failure.error.error.code) {
    case 'INVALID_CREDENTIALS':
    case 'VALIDATION_FAILED':
      return { kind: 'invalid_credentials' };
    case 'AUTH_BUSY':
      return { kind: 'busy' };
    case 'TOO_MANY_REQUESTS':
      return {
        kind: 'rate_limited',
        retryAfterSeconds: failure.retryAfterSeconds ?? null,
      };
    default:
      return { kind: 'unavailable' };
  }
}
