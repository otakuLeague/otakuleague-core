// @vitest-environment node
import type { ApiErrorCode, SignUpResponse } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { CredentialCallResult } from './credential-call';
import { readSignUpFields, signUpOutcomeFrom } from './sign-up-form-state';

type Fields = Readonly<Record<string, string | Blob>>;
const formWith = (fields: Fields) => {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
};
const aFile = () => new File(['secret'], 'password.txt');
const VALID = { username: 'Far_01', email: 'f@x.co', password: 'hunter22!' };
const ALL = ['username', 'email', 'password'];

const failedWith = (
  failure: ApiFailure,
): CredentialCallResult<SignUpResponse> => ({
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
const failed = (formState: object) => ({ kind: 'failed', formState });
const invalid = (fields: readonly string[]) => ({
  kind: 'invalid_fields',
  fields,
});

describe('readSignUpFields', () => {
  it.each([
    VALID,
    { username: 'abc', email: ' F@Example.COM ', password: ' p ' },
    {
      username: 'u'.repeat(20),
      email: 'e'.repeat(254),
      password: 'p'.repeat(1024),
    },
  ])('keeps $username and $email exactly as typed', (fields) => {
    expect(readSignUpFields(formWith(fields))).toEqual({
      kind: 'read',
      request: fields,
    });
  });

  it.each<[Fields, readonly string[]]>([
    [{ ...VALID, username: 'ab' }, ['username']],
    [{ ...VALID, username: 'u'.repeat(21) }, ['username']],
    [{ ...VALID, username: 'far@ouk' }, ['username']],
    [{ ...VALID, username: ' farouk' }, ['username']],
    [{ ...VALID, email: '' }, ['email']],
    [{ ...VALID, email: 'e'.repeat(255) }, ['email']],
    [{ ...VALID, password: '' }, ['password']],
    [{ ...VALID, password: 'p'.repeat(1025) }, ['password']],
    [{ ...VALID, password: aFile() }, ['password']],
    [{ email: VALID.email }, ['username', 'password']],
    [{ password: '', email: aFile(), username: '' }, ALL],
    [{}, ALL],
  ])('names each field out of bounds, in form order: %o', (fields, named) => {
    expect(readSignUpFields(formWith(fields))).toEqual(invalid(named));
  });

  it.each([undefined, null, 'username=abc', VALID, new URLSearchParams(VALID)])(
    'names every field for %o, which is not a FormData',
    (value) => {
      expect(readSignUpFields(value)).toEqual(invalid(ALL));
    },
  );
});

describe('signUpOutcomeFrom', () => {
  it('accepts with the bindingToken of a 202', () => {
    const bindingToken = 'A'.repeat(43);
    expect(
      signUpOutcomeFrom({
        kind: 'called',
        result: { ok: true, data: { bindingToken } },
      }),
    ).toEqual({ kind: 'accepted', bindingToken });
  });

  it.each([
    ['USERNAME_TAKEN', 'username_taken'],
    ['SIGN_UP_CLOSED', 'sign_up_closed'],
    ['AUTH_BUSY', 'busy'],
    ['INVALID_CREDENTIALS', 'unavailable'],
    ['BAD_REQUEST', 'unavailable'],
    ['INTERNAL_KEY_REQUIRED', 'unavailable'],
    ['INTERNAL_ERROR', 'unavailable'],
  ] as const)('maps %s to %s, with no Retry-After', (code, kind) => {
    expect(signUpOutcomeFrom(apiError(code, 1))).toEqual(failed({ kind }));
  });

  it.each([
    [120, 120],
    [undefined, null],
  ])(
    'maps TOO_MANY_REQUESTS with Retry-After %o to rate_limited %o',
    (seconds, retryAfterSeconds) => {
      expect(signUpOutcomeFrom(apiError('TOO_MANY_REQUESTS', seconds))).toEqual(
        failed({ kind: 'rate_limited', retryAfterSeconds }),
      );
    },
  );

  it.each<[readonly string[], object]>([
    [['password', 'password'], invalid(['password'])],
    [['password', 'email', 'username'], invalid(ALL)],
    [['email', 'extra', 'session.token'], invalid(['email'])],
    [[], { kind: 'unavailable' }],
    [['extra', 'Username'], { kind: 'unavailable' }],
  ])('maps VALIDATION_FAILED on %o to %o, never a message', (named, state) => {
    const details = named.map((field) => ({ field, message: `${field} p@ss` }));
    const result = failedWith({
      kind: 'api_error',
      status: 400,
      error: { error: { code: 'VALIDATION_FAILED', message: 'x', details } },
    });
    expect(signUpOutcomeFrom(result)).toEqual(failed(state));
  });

  it.each([
    [{ kind: 'refused', reason: 'preview_deployment' }, 'off_on_preview'],
    [{ kind: 'refused', reason: 'action_forwarded' }, 'unavailable'],
    [{ kind: 'refused', reason: 'client_ip_unknown' }, 'unavailable'],
    [failedWith({ kind: 'network' }), 'unavailable'],
    [failedWith({ kind: 'timeout' }), 'unavailable'],
    [failedWith({ kind: 'invalid_response', status: 202 }), 'unavailable'],
  ] as const)('maps %o to %s', (callResult, kind) => {
    expect(signUpOutcomeFrom(callResult)).toEqual(failed({ kind }));
  });
});
