import { createHmac, type KeyObject } from 'node:crypto';
import type { VisitorKey } from '../common/api-caller';
import type { NormalisedIdentifier } from './credential-rules';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** At most `limit` counted attempts per fixed window of `windowMs`. */
export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/** Sign-in limits, ADR 0015 "Rate limits" (requirement 3); a test pins these numbers. */
export const SIGN_IN_LIMITS = {
  ip: { limit: 30, windowMs: 15 * MINUTE_MS },
  identifierIp: { limit: 5, windowMs: 15 * MINUTE_MS },
  identifier: { limit: 30, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitRule>;

export type AuthRateLimitRoute = 'sign-in';

export type RateLimitScope = keyof typeof SIGN_IN_LIMITS;

/**
 * What each scope counts: the visitor key (IPv4, or IPv6 cut to its /64) and the normalised
 * identifier, both branded so a raw header or an unnormalised identifier is a type error.
 */
interface ScopeParts {
  readonly ip: readonly [VisitorKey];
  readonly identifierIp: readonly [NormalisedIdentifier, VisitorKey];
  readonly identifier: readonly [NormalisedIdentifier];
}

declare const rateLimitKeyBrand: unique symbol;

/** A 32-byte HMAC digest: the only key AuthRateLimiter accepts, never an IP or an identifier. */
export type RateLimitKey = Buffer & { readonly [rateLimitKeyBrand]: true };

/** Separates these digests from any other future use of AUTH_HMAC_KEY. */
const KEY_PURPOSE = 'auth-rate-limit';

/**
 * HMAC-SHA256 over a JSON array, an unambiguous encoding: ("ab", "c") and ("a", "bc") give
 * different input, and quotes or commas inside a part are escaped. The table thus stores no IP
 * or email, and without AUTH_HMAC_KEY a stored key cannot be tested against a guess.
 */
export function rateLimitKey<S extends RateLimitScope>(
  hmacKey: KeyObject,
  route: AuthRateLimitRoute,
  scope: S,
  parts: ScopeParts[S],
): RateLimitKey {
  const message = JSON.stringify([KEY_PURPOSE, route, scope, ...parts]);
  return createHmac('sha256', hmacKey)
    .update(message, 'utf8')
    .digest() as RateLimitKey;
}

export type RateLimitDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number };

export const RATE_LIMIT_ALLOWED: RateLimitDecision = { kind: 'allowed' };

/**
 * `count` is the counter after this attempt. Allowed while it is at most the limit; written so
 * that a NaN count is limited, never allowed. Retry-After is the rest of the window in whole
 * seconds, rounded up, at least 1 and at most the window (an invalid date gives the window).
 */
export function decide(
  count: number,
  windowStart: Date,
  rule: RateLimitRule,
  now: Date,
): RateLimitDecision {
  if (count <= rule.limit) return RATE_LIMIT_ALLOWED;
  const windowSeconds = Math.ceil(rule.windowMs / 1000);
  const remainingMs = windowStart.getTime() + rule.windowMs - now.getTime();
  const retryAfterSeconds = Number.isFinite(remainingMs)
    ? Math.min(windowSeconds, Math.max(1, Math.ceil(remainingMs / 1000)))
    : windowSeconds;
  return { kind: 'limited', retryAfterSeconds };
}
