import { createSecretKey } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import {
  rateLimitKey,
  type RateLimitKey,
  SIGN_IN_LIMITS,
} from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { normaliseIdentifier } from './credential-rules';

// No database: a fake $queryRaw answers each upsert in turn. Real SQL: the integration spec.
const NOW = new Date('2026-11-15T10:00:00.000Z');
const HMAC_KEY = createSecretKey(
  Buffer.from('fake-auth-hmac-key-'.padEnd(64, '0')),
);
const IP = visitorKeyFromClientIp('203.0.113.7');
const FRIEREN = normaliseIdentifier('frieren@example.com');
const IP_KEY = rateLimitKey(HMAC_KEY, 'sign-in', 'ip', [IP]);
const PAIR_KEY = rateLimitKey(HMAC_KEY, 'sign-in', 'identifierIp', [
  FRIEREN,
  IP,
]);
const IDENTIFIER_KEY = rateLimitKey(HMAC_KEY, 'sign-in', 'identifier', [
  FRIEREN,
]);
const SIGN_IN_HITS = [
  { key: IP_KEY, rule: SIGN_IN_LIMITS.ip },
  { key: PAIR_KEY, rule: SIGN_IN_LIMITS.identifierIp },
  { key: IDENTIFIER_KEY, rule: SIGN_IN_LIMITS.identifier },
] as const;

type QueryRaw = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ count: number; windowStartMs: number }[]>;

function limiterAnswering(queryRaw: QueryRaw): {
  readonly limiter: AuthRateLimiter;
  readonly keysCounted: () => RateLimitKey[];
} {
  const spy = vi.fn(queryRaw);
  const prisma = { $queryRaw: spy } as unknown as PrismaService;
  return {
    limiter: new AuthRateLimiter(prisma, new FixedClock(NOW)),
    keysCounted: () => spy.mock.calls.map((call) => call[1] as RateLimitKey),
  };
}

function counts(...values: number[]): QueryRaw {
  const queue = [...values];
  return () =>
    Promise.resolve([
      { count: queue.shift() ?? 0, windowStartMs: NOW.getTime() },
    ]);
}

describe('AuthRateLimiter.check', () => {
  it('counts every key in order and allows when all are within their limits', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(30, 5, 30));

    await expect(limiter.check(SIGN_IN_HITS)).resolves.toEqual({
      kind: 'allowed',
    });
    expect(keysCounted()).toEqual([IP_KEY, PAIR_KEY, IDENTIFIER_KEY]);
  });

  it('stops at the first refusal: later keys are never counted', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(31));

    await expect(limiter.check(SIGN_IN_HITS)).resolves.toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
    expect(keysCounted()).toEqual([IP_KEY]);
  });

  it('refuses at the middle key without counting the identifier', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(3, 6));

    await expect(limiter.check(SIGN_IN_HITS)).resolves.toMatchObject({
      kind: 'limited',
    });
    expect(keysCounted()).toEqual([IP_KEY, PAIR_KEY]);
  });

  it('propagates a database failure instead of letting the attempt through', async () => {
    const outage = new Error('connection refused');
    const { limiter } = limiterAnswering(() => Promise.reject(outage));

    await expect(limiter.check(SIGN_IN_HITS)).rejects.toBe(outage);
  });

  it('fails when the upsert returns no row, never allows', async () => {
    const { limiter } = limiterAnswering(() => Promise.resolve([]));

    await expect(limiter.check(SIGN_IN_HITS)).rejects.toThrow(
      'The rate-limit upsert returned no row',
    );
  });
});
