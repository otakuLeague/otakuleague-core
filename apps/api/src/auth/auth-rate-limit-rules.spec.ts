import { createSecretKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type VisitorKey, visitorKeyFromClientIp } from '../common/api-caller';
import {
  decide,
  rateLimitKey,
  type RateLimitRule,
  SIGN_IN_LIMITS,
} from './auth-rate-limit-rules';
import {
  type NormalisedIdentifier,
  normaliseIdentifier,
} from './credential-rules';

const HMAC_KEY = createSecretKey(
  Buffer.from('fake-auth-hmac-key-'.padEnd(64, '0')),
);
const OTHER_HMAC_KEY = createSecretKey(
  Buffer.from('fake-other-hmac-key-'.padEnd(64, '0')),
);
const IP = visitorKeyFromClientIp('203.0.113.7');
const OTHER_IP = visitorKeyFromClientIp('203.0.113.8');
const FRIEREN = normaliseIdentifier('frieren@example.com');
const HIMMEL = normaliseIdentifier('himmel');

const hex = (key: Buffer): string => key.toString('hex');

describe('SIGN_IN_LIMITS', () => {
  it('pins the ADR 0015 numbers: 30/IP and 5/(identifier, IP) per 15 min, 30/identifier per hour', () => {
    expect(SIGN_IN_LIMITS).toEqual({
      ip: { limit: 30, windowMs: 15 * 60_000 },
      identifierIp: { limit: 5, windowMs: 15 * 60_000 },
      identifier: { limit: 30, windowMs: 60 * 60_000 },
    });
  });
});

describe('rateLimitKey', () => {
  it('is a 32-byte digest that holds neither the IP nor the identifier', () => {
    const key = rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [
      FRIEREN,
      IP,
    ]);

    expect(key).toHaveLength(32);
    expect(key.toString('latin1')).not.toContain('203.0.113.7');
    expect(key.toString('latin1')).not.toContain('frieren');
  });

  it('is stable for the same inputs', () => {
    expect(hex(rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP]))).toBe(
      hex(rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP])),
    );
  });

  it('differs by scope, IP, identifier and HMAC key', () => {
    const keys = [
      rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [OTHER_IP]),
      rateLimitKey(OTHER_HMAC_KEY, 'sign-in', 'ip', [IP]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'identifier', [FRIEREN]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'identifier', [HIMMEL]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [FRIEREN, IP]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [FRIEREN, OTHER_IP]),
      rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [HIMMEL, IP]),
    ].map(hex);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never lets one scope collide with another for the same text', () => {
    const asIdentifier = normaliseIdentifier('203.0.113.7');

    expect(hex(rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP]))).not.toBe(
      hex(rateLimitKey(HMAC_KEY, 'sign-in', 'identifier', [asIdentifier])),
    );
  });

  it('encodes the parts unambiguously: ("ab", "c") is not ("a", "bc")', () => {
    // Brands bypassed on purpose: only the encoding is under test here.
    const split = (identifier: string, visitor: string): string =>
      hex(
        rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [
          identifier as NormalisedIdentifier,
          visitor as VisitorKey,
        ]),
      );

    expect(split('ab', 'c')).not.toBe(split('a', 'bc'));
    expect(split('a","b', 'c')).not.toBe(split('a', 'b","c'));
    expect(split('a,b', 'c')).not.toBe(split('a', 'b,c'));
  });

  it('counts a whole IPv6 /64 as one visitor', () => {
    expect(
      hex(
        rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [
          visitorKeyFromClientIp('2001:db8:1:2::1'),
        ]),
      ),
    ).toBe(
      hex(
        rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [
          visitorKeyFromClientIp('2001:db8:1:2:ffff:ffff:ffff:ffff'),
        ]),
      ),
    );
  });
});

describe('decide', () => {
  const RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60_000 };
  const WINDOW_START = new Date('2026-11-15T10:00:00.000Z');
  const at = (offsetMs: number): Date =>
    new Date(WINDOW_START.getTime() + offsetMs);

  it('allows every attempt up to the limit', () => {
    for (const count of [1, 4, 5]) {
      expect(decide(count, WINDOW_START, RULE, at(0))).toEqual({
        kind: 'allowed',
      });
    }
  });

  it('limits the attempt after the limit until the window ends', () => {
    expect(decide(6, WINDOW_START, RULE, at(0))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
    expect(decide(6, WINDOW_START, RULE, at(60_000))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 840,
    });
  });

  it('rounds Retry-After up and never below 1 second', () => {
    expect(decide(6, WINDOW_START, RULE, at(899_001))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 1,
    });
    expect(decide(6, WINDOW_START, RULE, at(898_999))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 2,
    });
    expect(decide(6, WINDOW_START, RULE, at(RULE.windowMs + 5_000))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 1,
    });
  });

  it('caps Retry-After at the window when the start lies ahead of the clock', () => {
    expect(decide(6, WINDOW_START, RULE, at(-60_000))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
  });

  it('limits a NaN count and answers the window for an invalid date', () => {
    expect(decide(Number.NaN, WINDOW_START, RULE, at(0)).kind).toBe('limited');
    expect(decide(6, new Date(Number.NaN), RULE, at(0))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
  });
});
