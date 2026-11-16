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

/** POST /auth/sign-in 200 body. Never cached (`no-store`); the token goes only into the session cookie. */
export interface SignInResponse {
  /** 43 base64url characters, sent back as `Authorization: Bearer <token>`. */
  readonly sessionToken: string;
  /** ISO 8601 (UTC): 30 days from now, renewed while in use (ADR 0015). */
  readonly expiresAt: string;
}
