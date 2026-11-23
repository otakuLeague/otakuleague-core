/**
 * Longest identifier as typed, in UTF-16 code units (what `@MaxLength` counts), checked on the
 * raw input before normaliseIdentifier. 254 is the longest email address (RFC 5321 path limit).
 * The API's DTOs and the web's sign-in form both use it (ADR 0015).
 */
export const IDENTIFIER_MAX = 254;

/**
 * Raw password UTF-16 units accepted before NFC runs: NFC on a long run of combining marks is slow
 * (1.7 s measured on 96 KB) and runs before the rate limiter, so a longer string is refused unread.
 * 8 × the API's `PASSWORD_MAX` (128 code points after NFC): NFC never folds 8 units into one.
 */
export const PASSWORD_RAW_MAX = 1024;

/** Shortest sign-up password, in Unicode code points after NFC (parity; ADR 0015 Addendum v3b). */
export const PASSWORD_MIN = 8;

/** A digit, punctuation or symbol (an emoji included); a letter, a mark or a space is not one. */
const DIGIT_OR_SYMBOL = /[\p{N}\p{P}\p{S}]/u;

/** Sign-up's two password rules, apart: the web ticks each one, the API needs both. */
export interface SignUpPasswordRules {
  readonly longEnough: boolean;
  readonly hasDigitOrSymbol: boolean;
}

/**
 * Judged on the NFC form (the API's `normalisePassword`): at least PASSWORD_MIN code points, and
 * at least one a digit or symbol. The upper bound and the common-password list stay the API's.
 */
export function signUpPasswordRules(password: string): SignUpPasswordRules {
  const normalised = password.normalize('NFC');
  return {
    longEnough: [...normalised].length >= PASSWORD_MIN,
    hasDigitOrSymbol: DIGIT_OR_SYMBOL.test(normalised),
  };
}

/** Sign-up's password rule (parity): both rules met. The API's DTO and the web's gate use it. */
export function meetsSignUpPasswordRule(password: string): boolean {
  const { longEnough, hasDigitOrSymbol } = signUpPasswordRules(password);
  return longEnough && hasDigitOrSymbol;
}

/**
 * Parity (PARITY.md): 3 to 20 ASCII letters, digits or "_". Never "@", which sign-in reads as an
 * email, and nothing the API's identifier normalisation could change but the letter case. The API's
 * sign-up and availability DTOs check it; the web checks `GET /me` with it (`isMeResponse`).
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

/** GET /me body: the member the session belongs to (ADR 0015). Never cached (`no-store`). */
export interface MeResponse {
  readonly id: string;
  readonly username: string;
}

/** POST /auth/sign-in body (ADR 0015). Sent only by the web server, with X-Client-Ip. */
export interface SignInRequest {
  /** Email address or username, any letter case; at most 254 characters. */
  readonly identifier: string;
  /** At most 128 characters (code points after NFC). */
  readonly password: string;
}

/** POST /auth/sign-up body (ADR 0020). Sent only by the web server, with X-Client-Ip. */
export interface SignUpRequest {
  /** 3 to 20 of A-Z, a-z, 0-9 and "_"; kept as typed, unique in any letter case. */
  readonly username: string;
  /** At most 254 characters; stored and mailed trimmed and lower-cased. */
  readonly email: string;
  /** 8 to 128 characters (code points after NFC), at least one a digit or symbol. */
  readonly password: string;
}

/** POST /auth/sign-up 202 body: the same for a new, a pending and a registered email. Never cached. */
export interface SignUpResponse {
  /** 43 base64url characters; the web keeps it in `ol_signup` for the one-click confirmation. */
  readonly bindingToken: string;
}

/** POST /auth/sign-in 200 body. Never cached (`no-store`); the token goes only into the session cookie. */
export interface SignInResponse {
  /** 43 base64url characters, sent back as `Authorization: Bearer <token>`. */
  readonly sessionToken: string;
  /** ISO 8601 (UTC): 30 days from now, renewed while in use (ADR 0015). */
  readonly expiresAt: string;
}

/** POST /auth/email-verification/confirm body (ADR 0020 Addendum 1e-ii). Sent only by the web server. */
export interface EmailVerificationConfirmRequest {
  /** The emailed token, as the link carried it; at most 128 characters. */
  readonly token: string;
  /** From `ol_signup`, when this browser signed up: the one-click path, which gives a session. */
  readonly bindingToken?: string;
  /** The sign-up password, typed on another browser after `confirmation_required`. */
  readonly password?: string;
}

/**
 * POST /auth/email-verification/confirm 200 body. Never cached (`no-store`). `session` is set only
 * when the binding matched; `already_verified` never carries one.
 */
export type EmailVerificationConfirmResponse =
  | { readonly outcome: 'verified'; readonly session: SignInResponse | null }
  | { readonly outcome: 'already_verified' }
  | { readonly outcome: 'confirmation_required' };

/** POST /auth/email-verification/resend body (ADR 0020 Addendum 1e-ii-b). Sent only by the web server. */
export interface EmailVerificationResendRequest {
  /** At most 254 characters; matched trimmed and lower-cased, like sign-up's. */
  readonly email: string;
}

/**
 * POST /auth/email-verification/resend 202 body: always `{}`, whatever the address, so it never
 * says whether a mail left. An empty object, not an empty body (ADR 0003). Never cached.
 */
export type EmailVerificationResendResponse = Readonly<Record<string, never>>;

/**
 * GET /users/availability?username= 200 body (ADR 0020 Addendum 1e-iii). Sent only to the web
 * server. `false` for a taken, held or reserved name alike, never says which; `true` is a hint,
 * not a reservation: sign-up can still answer 409. Never cached (`no-store`).
 */
export interface UsernameAvailabilityResponse {
  readonly available: boolean;
}
