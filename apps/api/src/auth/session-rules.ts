import { createHash } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A session lives this long after its last renewal (ADR 0015). */
export const SESSION_IDLE_MS = 30 * DAY_MS;
/** Renewed only when less than this remains: one write per session per 15 days at most. */
export const SESSION_RENEW_BELOW_MS = 15 * DAY_MS;
/** Hard stop after creation, however often the session was renewed. Keep equal to the web's `SESSION_COOKIE_MAX_AGE_SECONDS` (apps/web/src/auth/auth-cookies.ts). */
export const SESSION_MAX_AGE_MS = 180 * DAY_MS;

/** Random bytes in a new session token (ADR 0015). */
export const SESSION_TOKEN_BYTES = 32;

/** SESSION_TOKEN_BYTES in base64url without padding: exactly 43 characters. */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const BEARER_PREFIX = 'Bearer ';

/**
 * The token of an `Authorization: Bearer <token>` header, or null for anything else (missing,
 * another scheme, wrong length or alphabet), so a malformed header never reaches the database.
 */
export function sessionTokenFromHeader(header: unknown): string | null {
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length);
  return SESSION_TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * What is stored instead of the token. The lookup compares digests in a unique index, so its
 * timing says nothing about the token, and a database leak holds no usable session.
 */
export function hashSessionToken(token: string): Uint8Array<ArrayBuffer> {
  return createHash('sha256').update(token, 'utf8').digest();
}

export interface SessionTimes {
  readonly sessionEpoch: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type SessionValidity =
  /** `renewTo`: the new expiry to store, or null when no write is due. */
  | { readonly kind: 'valid'; readonly renewTo: Date | null }
  | { readonly kind: 'expired' }
  /** The user's epoch moved (password reset, sign out everywhere). */
  | { readonly kind: 'revoked' };

/**
 * Valid only while the epochs match and `now` is strictly before both the expiry and the hard
 * stop; written so that an invalid date (NaN) is expired, never valid. Under 15 days left, the
 * expiry moves to now + 30 days, capped at the hard stop, and only ever forward.
 */
export function sessionValidity(
  session: SessionTimes,
  user: { readonly sessionEpoch: number },
  now: Date,
): SessionValidity {
  if (session.sessionEpoch !== user.sessionEpoch) return { kind: 'revoked' };
  const nowMs = now.getTime();
  const expiresMs = session.expiresAt.getTime();
  const hardStopMs = session.createdAt.getTime() + SESSION_MAX_AGE_MS;
  if (!(nowMs < expiresMs && nowMs < hardStopMs)) return { kind: 'expired' };
  if (expiresMs - nowMs >= SESSION_RENEW_BELOW_MS) {
    return { kind: 'valid', renewTo: null };
  }
  const renewMs = Math.min(nowMs + SESSION_IDLE_MS, hardStopMs);
  return {
    kind: 'valid',
    renewTo: renewMs > expiresMs ? new Date(renewMs) : null,
  };
}
