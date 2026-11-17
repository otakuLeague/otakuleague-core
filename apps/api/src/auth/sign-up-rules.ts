/**
 * `PENDING_SIGN_UP_TTL` (ADR 0015): how long a sign-up submit holds its username, how long its
 * verification token lives, and how far ahead each submit sets an unverified account's
 * `pendingExpiresAt`, after which the auth cleanup deletes it.
 */
export const PENDING_SIGN_UP_TTL_MS = 24 * 60 * 60 * 1000;
