import { createHmac, type KeyObject } from 'node:crypto';
import { sharedVisitorBucket, type VisitorKey } from '../common/api-caller';
import type { NormalisedIdentifier } from './credential-rules';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * At most `limit` counted attempts per fixed window of `windowMs`, anchored at the key's first
 * attempt. Accepted (ADR 0015): a burst straddling a window boundary can reach 2 x limit - 1.
 */
export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * The auth cleanup deletes a counter once its window started this long ago, so no rule's
 * windowMs may exceed it (AuthRateLimiter refuses such a rule). Keyed hashes of IPs and identifiers thus
 * live at most this plus one cleanup interval, about 48 h (ADR 0015 privacy note).
 */
export const RATE_LIMIT_LONGEST_WINDOW_MS = 24 * HOUR_MS;

/** Sign-in limits, ADR 0015 "Rate limits" (requirement 3); a test pins these numbers. */
export const SIGN_IN_LIMITS = {
  ip: { limit: 30, windowMs: 15 * MINUTE_MS },
  identifierIp: { limit: 5, windowMs: 15 * MINUTE_MS },
  identifier: { limit: 30, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitRule>;

/** Routes counted per IP alone, ADR 0015 "Rate limits"; a test pins these numbers. */
export const PER_IP_LIMITS = {
  'sign-up': { limit: 5, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitRule>;

export type PerIpRoute = keyof typeof PER_IP_LIMITS;

export type AuthRateLimitRoute = 'sign-in' | PerIpRoute;

export type RateLimitScope = keyof typeof SIGN_IN_LIMITS;

declare const clientIpBrand: unique symbol;

/** A visitor key that is a real client IP (IPv4, or IPv6 cut to its /64), never a shared bucket. */
export type ClientIpKey = VisitorKey & { readonly [clientIpBrand]: true };

/**
 * Null for the shared `unknown` and `preview` buckets: a credential route without a valid client
 * IP is refused, never counted in a bucket every such caller shares (ADR 0015).
 */
export function clientIpKey(visitorKey: VisitorKey): ClientIpKey | null {
  return sharedVisitorBucket(visitorKey) === null
    ? (visitorKey as ClientIpKey)
    : null;
}

/** What each scope counts, branded so a raw header or an unnormalised identifier is a type error. */
interface ScopeParts {
  readonly ip: readonly [ClientIpKey];
  readonly identifierIp: readonly [NormalisedIdentifier, ClientIpKey];
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

/** One key to count an attempt against, under its rule. */
export interface RateLimitHit {
  readonly key: RateLimitKey;
  readonly rule: RateLimitRule;
}

declare const rateLimitHitsBrand: unique symbol;

/** Ordered keys for one attempt, built only by a route's builder such as signInHits. */
export type RateLimitHits = readonly [RateLimitHit, ...RateLimitHit[]] & {
  readonly [rateLimitHitsBrand]: true;
};

/** A sign-in's three keys, in signInHits' order. */
export type SignInHits = readonly [RateLimitHit, RateLimitHit, RateLimitHit] &
  RateLimitHits;

/**
 * A sign-in attempt's keys in the order ADR 0015's arithmetic needs: per IP first (refuses a
 * flood before any per-identifier count), then (identifier, IP), then the identifier alone, so
 * one IP stops at 5 per 15 min and never uses up the identifier's 30 an hour. The identifier
 * ceiling is per spelling: email and username count apart, up to 2x per account (accepted: one
 * counter per account would let a caller link a username to an email).
 */
export function signInHits(
  hmacKey: KeyObject,
  ip: ClientIpKey,
  identifier: NormalisedIdentifier,
): SignInHits {
  const hits: readonly [RateLimitHit, RateLimitHit, RateLimitHit] = [
    {
      key: rateLimitKey(hmacKey, 'sign-in', 'ip', [ip]),
      rule: SIGN_IN_LIMITS.ip,
    },
    {
      key: rateLimitKey(hmacKey, 'sign-in', 'identifierIp', [identifier, ip]),
      rule: SIGN_IN_LIMITS.identifierIp,
    },
    {
      key: rateLimitKey(hmacKey, 'sign-in', 'identifier', [identifier]),
      rule: SIGN_IN_LIMITS.identifier,
    },
  ];
  return hits as SignInHits;
}

/** The one key of a route counted per IP alone; the route is in the key, so no two routes share it. */
export function perIpHits(
  hmacKey: KeyObject,
  route: PerIpRoute,
  ip: ClientIpKey,
): RateLimitHits {
  const hits: readonly [RateLimitHit] = [
    {
      key: rateLimitKey(hmacKey, route, 'ip', [ip]),
      rule: PER_IP_LIMITS[route],
    },
  ];
  return hits as RateLimitHits;
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
