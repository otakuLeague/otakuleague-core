import { createSecretKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_VISITOR_KEY,
  visitorKeyFromClientIp,
} from '../common/api-caller';
import {
  type ClientIpKey,
  CONFIRM_PASSWORD_LIMIT,
  clientIpKey,
  confirmPasswordHits,
  decide,
  PER_IP_LIMITS,
  perIpHits,
  RATE_LIMIT_LONGEST_WINDOW_MS,
  rateLimitKey,
  type RateLimitRule,
  SIGN_IN_LIMITS,
  signInHits,
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

function ipKey(header: string): ClientIpKey {
  const key = clientIpKey(visitorKeyFromClientIp(header));
  if (key === null) throw new Error(`${header} is not a client IP`);
  return key;
}

const IP = ipKey('203.0.113.7');
const OTHER_IP = ipKey('203.0.113.8');
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

describe('PER_IP_LIMITS', () => {
  it('pins the ADR 0015 numbers: sign-up 5 per IP per hour, confirm 10 per IP per 15 min, resend 10 per IP per hour, availability 60 per IP per minute', () => {
    expect(PER_IP_LIMITS).toEqual({
      'sign-up': { limit: 5, windowMs: 60 * 60_000 },
      'email-verification-confirm': { limit: 10, windowMs: 15 * 60_000 },
      'email-verification-resend': { limit: 10, windowMs: 60 * 60_000 },
      'username-availability': { limit: 60, windowMs: 60_000 },
    });
  });

  it('keeps every window within the cleanup horizon', () => {
    for (const rule of [
      ...Object.values(PER_IP_LIMITS),
      CONFIRM_PASSWORD_LIMIT,
    ]) {
      expect(rule.windowMs).toBeLessThanOrEqual(RATE_LIMIT_LONGEST_WINDOW_MS);
    }
  });
});

describe('confirmPasswordHits', () => {
  it('pins the ADR 0020 number: 10 password checks per account per hour', () => {
    expect(CONFIRM_PASSWORD_LIMIT).toEqual({
      limit: 10,
      windowMs: 60 * 60_000,
    });
  });

  it('counts the account email alone, under that rule', () => {
    expect(confirmPasswordHits(HMAC_KEY, FRIEREN)).toEqual([
      {
        key: rateLimitKey(
          HMAC_KEY,
          'email-verification-confirm',
          'identifier',
          [FRIEREN],
        ),
        rule: CONFIRM_PASSWORD_LIMIT,
      },
    ]);
  });

  it("never shares a counter with sign-in's identifier key or the confirm per-IP key", () => {
    const [password] = confirmPasswordHits(HMAC_KEY, FRIEREN);
    const signIn = signInHits(HMAC_KEY, IP, FRIEREN).map(({ key }) => hex(key));
    const [perIp] = perIpHits(HMAC_KEY, 'email-verification-confirm', IP);

    expect(signIn).not.toContain(hex(password.key));
    expect(hex(password.key)).not.toBe(hex(perIp.key));
  });

  it('differs by account and HMAC key, never by IP (it has none)', () => {
    const key = (hmacKey: typeof HMAC_KEY, email: NormalisedIdentifier) =>
      hex(confirmPasswordHits(hmacKey, email)[0].key);

    expect(key(HMAC_KEY, FRIEREN)).not.toBe(
      key(HMAC_KEY, normaliseIdentifier('himmel@example.com')),
    );
    expect(key(HMAC_KEY, FRIEREN)).not.toBe(key(OTHER_HMAC_KEY, FRIEREN));
    expect(key(HMAC_KEY, FRIEREN)).toBe(
      key(HMAC_KEY, normaliseIdentifier(' FRIEREN@example.com ')),
    );
  });
});

describe('perIpHits', () => {
  it('counts the IP alone, under the route rule', () => {
    expect(perIpHits(HMAC_KEY, 'sign-up', IP)).toEqual([
      {
        key: rateLimitKey(HMAC_KEY, 'sign-up', 'ip', [IP]),
        rule: PER_IP_LIMITS['sign-up'],
      },
    ]);
  });

  it('never shares a counter with sign-in or another route for the same IP', () => {
    const [signUp] = perIpHits(HMAC_KEY, 'sign-up', IP);
    const [confirm] = perIpHits(HMAC_KEY, 'email-verification-confirm', IP);
    const [resend] = perIpHits(HMAC_KEY, 'email-verification-resend', IP);
    const [signIn] = signInHits(HMAC_KEY, IP, FRIEREN);

    expect(hex(signUp.key)).not.toBe(hex(signIn.key));
    expect(hex(confirm.key)).not.toBe(hex(signIn.key));
    expect(hex(confirm.key)).not.toBe(hex(signUp.key));
    expect(hex(resend.key)).not.toBe(hex(signIn.key));
    expect(hex(resend.key)).not.toBe(hex(signUp.key));
    expect(hex(resend.key)).not.toBe(hex(confirm.key));
  });

  it('differs by IP and HMAC key, and counts a whole IPv6 /64 as one visitor', () => {
    const key = (hmacKey: typeof HMAC_KEY, ip: ClientIpKey): string =>
      hex(perIpHits(hmacKey, 'sign-up', ip)[0].key);

    expect(key(HMAC_KEY, IP)).not.toBe(key(HMAC_KEY, OTHER_IP));
    expect(key(HMAC_KEY, IP)).not.toBe(key(OTHER_HMAC_KEY, IP));
    expect(key(HMAC_KEY, ipKey('2001:db8:1:2::1'))).toBe(
      key(HMAC_KEY, ipKey('2001:db8:1:2:ffff::9')),
    );
  });
});

describe('RATE_LIMIT_LONGEST_WINDOW_MS', () => {
  it('keeps keyed hashes of IPs and identifiers at most a day past their window start', () => {
    expect(RATE_LIMIT_LONGEST_WINDOW_MS).toBe(24 * 60 * 60_000);
  });
});

describe('clientIpKey', () => {
  it('keeps an IPv4 and an IPv6 /64 visitor key', () => {
    expect(clientIpKey(visitorKeyFromClientIp('203.0.113.7'))).toBe(
      '203.0.113.7',
    );
    expect(clientIpKey(visitorKeyFromClientIp('2001:db8:1:2::1'))).toBe(
      '2001:db8:1:2::/64',
    );
  });

  it.each([
    ['a missing header (unknown)', undefined],
    ['a malformed header (unknown)', 'not-an-ip'],
    ['a list of IPs (unknown)', '203.0.113.7, 198.51.100.1'],
  ])('refuses %s: never counted in a shared bucket', (_, header) => {
    expect(clientIpKey(visitorKeyFromClientIp(header))).toBeNull();
  });

  it('refuses the shared preview bucket', () => {
    expect(clientIpKey(PREVIEW_VISITOR_KEY)).toBeNull();
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
          visitor as ClientIpKey,
        ]),
      );

    expect(split('ab', 'c')).not.toBe(split('a', 'bc'));
    expect(split('a","b', 'c')).not.toBe(split('a', 'b","c'));
    expect(split('a,b', 'c')).not.toBe(split('a', 'b,c'));
  });

  it('counts a whole IPv6 /64 as one visitor', () => {
    expect(
      hex(rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [ipKey('2001:db8:1:2::1')])),
    ).toBe(
      hex(
        rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [
          ipKey('2001:db8:1:2:ffff:ffff:ffff:ffff'),
        ]),
      ),
    );
  });
});

describe('signInHits', () => {
  it('orders the keys ip, then (identifier, IP), then identifier, each with its own rule', () => {
    expect(signInHits(HMAC_KEY, IP, FRIEREN)).toEqual([
      {
        key: rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP]),
        rule: SIGN_IN_LIMITS.ip,
      },
      {
        key: rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [FRIEREN, IP]),
        rule: SIGN_IN_LIMITS.identifierIp,
      },
      {
        key: rateLimitKey(HMAC_KEY, 'sign-in', 'identifier', [FRIEREN]),
        rule: SIGN_IN_LIMITS.identifier,
      },
    ]);
  });

  it('counts an email and a username of the same account apart (per spelling)', () => {
    const [, , byEmail] = signInHits(HMAC_KEY, IP, FRIEREN);
    const [, , byUsername] = signInHits(HMAC_KEY, IP, HIMMEL);

    expect(hex(byEmail.key)).not.toBe(hex(byUsername.key));
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
