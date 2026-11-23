import { createHash, timingSafeEqual } from 'node:crypto';
import type { NormalisedIdentifier } from './credential-rules';

/**
 * `PENDING_SIGN_UP_TTL` (ADR 0015): how long a sign-up submit holds its username, how long its
 * verification token lives, and how far ahead each submit sets an unverified account's
 * `pendingExpiresAt`, after which the auth cleanup deletes it.
 */
export const PENDING_SIGN_UP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Production has no email provider yet (ADR 0020 N5): never an account nobody can confirm. A 403,
 * not a 503: the filter logs every 5xx with a stack, and this answer is expected, not a fault.
 * Sign-up and resend give the same answer.
 */
export const SIGN_UP_CLOSED_MESSAGE = 'Sign-up is not open yet.';

/** `USERNAME_PATTERN`'s (`@otakuleague/shared-types`) message, for sign-up and the availability check alike; never echoes the value. */
export const USERNAME_RULE_MESSAGE =
  'username must be 3 to 20 letters, digits or underscores';

/**
 * Lower-case ASCII only, checked on normaliseIdentifier output (what is stored and mailed): a local
 * part of at most 64, "@", then dot-separated labels ending in one that starts with a letter. No
 * space, control character or non-ASCII letter can reach a mail header or the lower-case CHECK.
 * Linear: no class holds both a label character and the "." or "@" that ends it.
 */
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{1,62}$/;

export function isEmailAddress(email: NormalisedIdentifier): boolean {
  return EMAIL_PATTERN.test(email);
}

/** Random bytes in a verification token and in a sign-up's bindingToken (ADR 0015). */
export const AUTH_TOKEN_BYTES = 32;

/** What `auth_token` stores for a token and its binding: the SHA-256, never the token. */
export function hashAuthToken(token: string): Uint8Array<ArrayBuffer> {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * True only when a bindingToken was sent, the token row stores a binding, and the SHA-256 of the
 * one equals the other, compared in constant time. A missing side never matches.
 */
export function bindingMatches(
  bindingToken: string | undefined,
  bindingHash: Uint8Array | null,
): boolean {
  if (bindingToken === undefined || bindingHash === null) return false;
  const presented = hashAuthToken(bindingToken);
  return (
    bindingHash.length === presented.length &&
    timingSafeEqual(presented, bindingHash)
  );
}
