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
