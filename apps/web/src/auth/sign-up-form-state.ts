import {
  IDENTIFIER_MAX,
  PASSWORD_RAW_MAX,
  USERNAME_PATTERN,
  type SignUpRequest,
  type SignUpResponse,
} from '@otakuleague/shared-types';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';

/** The sign-up form's fields, in the order it shows them. */
const SIGN_UP_FIELDS = ['username', 'email', 'password'] as const;

export type SignUpField = (typeof SIGN_UP_FIELDS)[number];

/** Never empty, in form order, each name once: never a value or the API's message. */
type InvalidFields = {
  readonly kind: 'invalid_fields';
  readonly fields: readonly [SignUpField, ...SignUpField[]];
};

/** What the sign-up form shows: `idle` before the first submit. Never carries what was typed. */
export type SignUpFormState =
  | { readonly kind: 'idle' }
  | InvalidFields
  | { readonly kind: 'username_taken' }
  | { readonly kind: 'sign_up_closed' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'busy' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'off_on_preview' };

export type SignUpFailureState = Exclude<
  SignUpFormState,
  { readonly kind: 'idle' }
>;

export type SignUpOutcome =
  | { readonly kind: 'accepted'; readonly bindingToken: string }
  | { readonly kind: 'failed'; readonly formState: SignUpFailureState };

type SignUpFieldsReading =
  { readonly kind: 'read'; readonly request: SignUpRequest } | InvalidFields;

const EVERY_FIELD: InvalidFields = {
  kind: 'invalid_fields',
  fields: SIGN_UP_FIELDS,
};

/** Local bounds only: the password rule and the email shape stay the API's (Addendum 1f-v). */
const FIELD_RULES: Readonly<Record<SignUpField, (value: string) => boolean>> = {
  username: (value) => USERNAME_PATTERN.test(value),
  email: (value) => value.length > 0 && value.length <= IDENTIFIER_MAX,
  password: (value) => value.length > 0 && value.length <= PASSWORD_RAW_MAX,
};

/**
 * The three fields exactly as typed (no trim, no case change: the API normalises them itself), or
 * `invalid_fields` naming each one missing, a file or out of bounds; no request goes out then. A
 * forged action call can pass anything, so the argument is checked to be a FormData first.
 */
export function readSignUpFields(formData: unknown): SignUpFieldsReading {
  if (!(formData instanceof FormData)) {
    return EVERY_FIELD;
  }
  const read = (field: SignUpField): string | undefined => {
    const value = formData.get(field);
    return typeof value === 'string' && FIELD_RULES[field](value)
      ? value
      : undefined;
  };
  const request = {
    username: read('username'),
    email: read('email'),
    password: read('password'),
  };
  const { username, email, password } = request;
  if (username !== undefined && email !== undefined && password !== undefined) {
    return { kind: 'read', request: { username, email, password } };
  }
  // At least one field is undefined here: the fallback only satisfies the type.
  return fieldsNamed((field) => request[field] === undefined) ?? EVERY_FIELD;
}

function fieldsNamed(
  isNamed: (field: SignUpField) => boolean,
): InvalidFields | undefined {
  const [first, ...rest] = SIGN_UP_FIELDS.filter(isNamed);
  return first === undefined
    ? undefined
    : { kind: 'invalid_fields', fields: [first, ...rest] };
}

/**
 * One credential call as the form sees it, by error code only (the API's message is never shown).
 * Nothing is retried: `AUTH_BUSY` drops its Retry-After, since each attempt counts against the
 * visitor's limits (ADR 0020). Anything unexpected is `unavailable`, never an accepted sign-up.
 */
export function signUpOutcomeFrom(
  callResult: CredentialCallResult<SignUpResponse>,
): SignUpOutcome {
  if (callResult.kind === 'refused') {
    return failed(
      callResult.reason === 'preview_deployment'
        ? { kind: 'off_on_preview' }
        : { kind: 'unavailable' },
    );
  }
  const { result } = callResult;
  return result.ok
    ? { kind: 'accepted', bindingToken: result.data.bindingToken }
    : failed(failureStateFrom(result.failure));
}

function failed(formState: SignUpFailureState): SignUpOutcome {
  return { kind: 'failed', formState };
}

function failureStateFrom(failure: ApiFailure): SignUpFailureState {
  if (failure.kind !== 'api_error') {
    return { kind: 'unavailable' };
  }
  const { error } = failure.error;
  switch (error.code) {
    case 'VALIDATION_FAILED':
      // A 400 naming none of the three fields is not the visitor's to fix.
      return (
        fieldsNamed((field) =>
          error.details.some((issue) => issue.field === field),
        ) ?? {
          kind: 'unavailable',
        }
      );
    case 'USERNAME_TAKEN':
      return { kind: 'username_taken' };
    case 'SIGN_UP_CLOSED':
      return { kind: 'sign_up_closed' };
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
