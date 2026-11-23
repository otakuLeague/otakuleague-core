import {
  EMAIL_VERIFICATION_LINK,
  isSessionToken,
  type EmailVerificationConfirmResponse,
} from '@otakuleague/shared-types';
import type { CredentialCallResult } from './credential-call';

/**
 * Every `Location` `GET /auth/verify` answers with (ADR 0015 Addendum 1f-vi, N36): six constants,
 * relative, never built from the request.
 */
export const EMAIL_LINK_LANDINGS = {
  signedIn: '/auth/verify/signed-in',
  password: '/auth/verify/password',
  confirmed: '/auth/verify/confirmed',
  expired: '/auth/verify/expired',
  tryAgain: '/auth/verify/try-again',
  preview: '/auth',
} as const;

export type EmailLinkLanding =
  (typeof EMAIL_LINK_LANDINGS)[keyof typeof EMAIL_LINK_LANDINGS];

/** One confirm call as the link sees it, by `outcome` and error code only. */
export type VerifyLinkOutcome =
  | { readonly kind: 'signed_in'; readonly sessionToken: string }
  | { readonly kind: 'confirmation_required' }
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'try_again' };

/**
 * The emailed token: exactly one `token` value of 43 base64url characters (the shape of the
 * binding and of a session token), else nothing, and no call goes out.
 */
export function emailLinkTokenFrom(
  searchParams: URLSearchParams,
): string | undefined {
  const values = searchParams.getAll(EMAIL_VERIFICATION_LINK.tokenParam);
  return values.length === 1 ? wellFormedAuthToken(values[0]) : undefined;
}

/** The binding read from `ol_signup`: sent only when well-formed, else left out (never `null`). */
export function wellFormedAuthToken(
  value: string | undefined,
): string | undefined {
  return value !== undefined && isSessionToken(value) ? value : undefined;
}

/**
 * Only a 200 the guard accepted confirms anything; `AUTH_TOKEN_INVALID` is a dead link; anything
 * else (a refusal, 429, `AUTH_BUSY`, an outage, an off-contract body) is `try_again`, since the link
 * still works later. `verified` with `session: null` signs nobody in.
 */
export function verifyLinkOutcomeFrom(
  callResult: CredentialCallResult<EmailVerificationConfirmResponse>,
): VerifyLinkOutcome {
  if (callResult.kind === 'refused') {
    return { kind: 'try_again' };
  }
  const { result } = callResult;
  if (!result.ok) {
    const { failure } = result;
    return failure.kind === 'api_error' &&
      failure.error.error.code === 'AUTH_TOKEN_INVALID'
      ? { kind: 'expired' }
      : { kind: 'try_again' };
  }
  const answer = result.data;
  switch (answer.outcome) {
    case 'verified':
      return answer.session === null
        ? { kind: 'confirmed' }
        : { kind: 'signed_in', sessionToken: answer.session.sessionToken };
    case 'already_verified':
      return { kind: 'confirmed' };
    case 'confirmation_required':
      return { kind: 'confirmation_required' };
  }
}

const LANDING_OF: Readonly<
  Record<VerifyLinkOutcome['kind'], EmailLinkLanding>
> = {
  signed_in: EMAIL_LINK_LANDINGS.signedIn,
  confirmation_required: EMAIL_LINK_LANDINGS.password,
  confirmed: EMAIL_LINK_LANDINGS.confirmed,
  expired: EMAIL_LINK_LANDINGS.expired,
  try_again: EMAIL_LINK_LANDINGS.tryAgain,
};

export function landingOf({ kind }: VerifyLinkOutcome): EmailLinkLanding {
  return LANDING_OF[kind];
}
