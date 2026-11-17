import { createSecretKey } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import {
  clientIpKey,
  RATE_LIMIT_LONGEST_WINDOW_MS,
  type RateLimitHits,
  type RateLimitKey,
  signInHits,
} from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { normaliseIdentifier } from './credential-rules';

// No database: a fake $queryRaw answers each upsert in turn. Real SQL: the integration spec.
const NOW = new Date('2026-11-15T10:00:00.000Z');
const HMAC_KEY = createSecretKey(
  Buffer.from('fake-auth-hmac-key-'.padEnd(64, '0')),
);
const IP = clientIpKey(visitorKeyFromClientIp('203.0.113.7'));
if (IP === null) throw new Error('203.0.113.7 is a client IP');
const HITS = signInHits(
  HMAC_KEY,
  IP,
  normaliseIdentifier('frieren@example.com'),
);
const [IP_HIT, PAIR_HIT, IDENTIFIER_HIT] = HITS;

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
    // A tagged template call: [0] is the SQL strings, [1] the first value, the key.
    keysCounted: () => spy.mock.calls.map((call) => call[1] as RateLimitKey),
  };
}

/** Answers these counts in order; one query more than planned fails the test. */
function counts(...values: number[]): QueryRaw {
  const queue = [...values];
  return () => {
    const count = queue.shift();
    if (count === undefined) throw new Error('More upserts than planned');
    return Promise.resolve([{ count, windowStartMs: NOW.getTime() }]);
  };
}

describe('AuthRateLimiter.check', () => {
  it('counts every key in order and allows when all are within their limits', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(30, 5, 30));

    await expect(limiter.check(HITS)).resolves.toEqual({ kind: 'allowed' });
    expect(keysCounted()).toEqual([
      IP_HIT.key,
      PAIR_HIT.key,
      IDENTIFIER_HIT.key,
    ]);
  });

  it('stops at the first refusal: later keys are never counted', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(31));

    await expect(limiter.check(HITS)).resolves.toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
    expect(keysCounted()).toEqual([IP_HIT.key]);
  });

  it('refuses at the middle key without counting the identifier', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(3, 6));

    await expect(limiter.check(HITS)).resolves.toMatchObject({
      kind: 'limited',
    });
    expect(keysCounted()).toEqual([IP_HIT.key, PAIR_HIT.key]);
  });

  it('propagates a database failure instead of letting the attempt through', async () => {
    const outage = new Error('connection refused');
    const { limiter } = limiterAnswering(() => Promise.reject(outage));

    await expect(limiter.check(HITS)).rejects.toBe(outage);
  });

  it('refuses a rule whose window outlives the cleanup cutoff, before counting anything', async () => {
    const { limiter, keysCounted } = limiterAnswering(counts(1));
    const tooLong = [
      {
        key: IP_HIT.key,
        rule: { limit: 5, windowMs: RATE_LIMIT_LONGEST_WINDOW_MS + 1 },
      },
    ] as unknown as RateLimitHits;

    await expect(limiter.check(tooLong)).rejects.toThrow(
      'A rate-limit window is longer than RATE_LIMIT_LONGEST_WINDOW_MS',
    );
    expect(keysCounted()).toEqual([]);
  });

  it('fails when the upsert returns no row, never allows', async () => {
    const { limiter } = limiterAnswering(() => Promise.resolve([]));

    await expect(limiter.check(HITS)).rejects.toThrow(
      'The rate-limit upsert returned no row',
    );
  });
});
