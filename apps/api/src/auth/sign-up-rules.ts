const HOUR_MS = 60 * 60 * 1000;

/**
 * `PENDING_SIGN_UP_TTL` (ADR 0015): how long a sign-up submit holds its username, how long its
 * verification token lives, and how long an unverified account is kept without a live token.
 */
export const PENDING_SIGN_UP_TTL_MS = 24 * HOUR_MS;
