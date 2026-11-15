import { createSecretKey } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import {
  type ClientIpKey,
  clientIpKey,
  type RateLimitDecision,
  type RateLimitHits,
  type RateLimitKey,
  signInHits,
} from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { normaliseIdentifier } from './credential-rules';

// Real sign-in limits (ADR 0015): 30 per IP and 5 per (identifier, IP) per 15 min, 30 per
// identifier per hour.
const T0 = new Date('2026-11-15T10:00:00.000Z');
const MINUTES_15 = 15 * 60_000;
const HMAC_KEY = createSecretKey(
  Buffer.from('fake-auth-hmac-key-'.padEnd(64, '0')),
);
const FRIEREN = normaliseIdentifier('frieren@example.com');

function ipKey(header: string): ClientIpKey {
  const key = clientIpKey(visitorKeyFromClientIp(header));
  if (key === null) throw new Error(`${header} is not a client IP`);
  return key;
}

const IP = ipKey('203.0.113.7');
const HITS = signInHits(HMAC_KEY, IP, FRIEREN);
const [IP_HIT, PAIR_HIT, IDENTIFIER_HIT] = HITS;

/** A clock the test moves, to cross window boundaries. */
class MovableClock extends Clock {
  private instant = T0;

  now(): Date {
    return new Date(this.instant);
  }

  setOffset(offsetMs: number): void {
    this.instant = new Date(T0.getTime() + offsetMs);
  }
}

interface StoredCounter {
  readonly count: number;
  readonly windowStart: Date;
}

describe('AuthRateLimiter on Postgres', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limiter: AuthRateLimiter;
  const clock = new MovableClock();

  async function stored(key: RateLimitKey): Promise<StoredCounter | null> {
    const [row] = await prisma.$queryRaw<
      { count: number; windowStartMs: number }[]
    >`
      SELECT count, (extract(epoch FROM window_start) * 1000)::float8 AS "windowStartMs"
      FROM auth_rate_limit WHERE key = ${key}`;
    return row === undefined
      ? null
      : { count: row.count, windowStart: new Date(row.windowStartMs) };
  }

  async function checkTimes(
    hits: RateLimitHits,
    times: number,
  ): Promise<RateLimitDecision[]> {
    const decisions: RateLimitDecision[] = [];
    for (let attempt = 0; attempt < times; attempt += 1) {
      decisions.push(await limiter.check(hits));
    }
    return decisions;
  }

  beforeAll(async () => {
    app = await createTestApp({ clock });
    prisma = app.get(PrismaService);
    limiter = app.get(AuthRateLimiter);
  });

  beforeEach(async () => {
    clock.setOffset(0);
    await truncateAllTables(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts each attempt on all three keys, keeping the window start', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      clock.setOffset(attempt * 1000);
      expect(await limiter.check(HITS)).toEqual({ kind: 'allowed' });
    }

    for (const { key } of HITS) {
      expect(await stored(key)).toEqual({ count: 3, windowStart: T0 });
    }
  });

  it('allows 5 per (identifier, IP), then refuses with the rest of the window', async () => {
    const decisions = await checkTimes(HITS, 5);
    clock.setOffset(60_000);

    expect(decisions).toEqual(Array(5).fill({ kind: 'allowed' }));
    expect(await limiter.check(HITS)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 840,
    });
    expect((await stored(IP_HIT.key))?.count).toBe(6);
    expect((await stored(PAIR_HIT.key))?.count).toBe(6);
    // Stopped at the first refusal: one IP alone never uses up the identifier's budget.
    expect((await stored(IDENTIFIER_HIT.key))?.count).toBe(5);
  });

  it('starts a new window exactly when the old one ends, not a millisecond before', async () => {
    await checkTimes(HITS, 6);
    clock.setOffset(MINUTES_15 - 1);
    expect(await limiter.check(HITS)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 1,
    });

    clock.setOffset(MINUTES_15);
    const newWindow = new Date(T0.getTime() + MINUTES_15);

    expect(await limiter.check(HITS)).toEqual({ kind: 'allowed' });
    expect(await stored(IP_HIT.key)).toEqual({
      count: 1,
      windowStart: newWindow,
    });
    expect(await stored(PAIR_HIT.key)).toEqual({
      count: 1,
      windowStart: newWindow,
    });
    // The identifier's window is an hour: it keeps counting from T0.
    expect(await stored(IDENTIFIER_HIT.key)).toEqual({
      count: 6,
      windowStart: T0,
    });
  });

  it('refuses the 31st attempt from one IP before counting its identifier', async () => {
    for (let user = 0; user < 30; user += 1) {
      const hits = signInHits(HMAC_KEY, IP, normaliseIdentifier(`user${user}`));
      expect(await limiter.check(hits)).toEqual({ kind: 'allowed' });
    }
    const last = signInHits(HMAC_KEY, IP, normaliseIdentifier('user30'));

    expect(await limiter.check(last)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 900,
    });
    expect((await stored(IP_HIT.key))?.count).toBe(31);
    expect(await stored(last[1].key)).toBeNull();
    expect(await stored(last[2].key)).toBeNull();
  });

  it('caps one identifier at 30 an hour across IPs', async () => {
    const allowed: number[] = [];
    for (let host = 1; host <= 7; host += 1) {
      const hits = signInHits(HMAC_KEY, ipKey(`198.51.100.${host}`), FRIEREN);
      const decisions = await checkTimes(hits, 5);
      allowed.push(decisions.filter(({ kind }) => kind === 'allowed').length);
    }

    expect(allowed).toEqual([5, 5, 5, 5, 5, 5, 0]);
    expect(
      await limiter.check(signInHits(HMAC_KEY, ipKey('198.51.100.8'), FRIEREN)),
    ).toEqual({ kind: 'limited', retryAfterSeconds: 3600 });
  });

  it('stays exact under 50 concurrent attempts on the same keys', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 50 }, () => limiter.check(HITS)),
    );

    // Each attempt gets its own IP count 1..50; only counts 1..30 reach the pair key, whose
    // counts 1..5 reach the identifier: a lost update would let more than 5 through.
    expect(decisions.filter(({ kind }) => kind === 'allowed')).toHaveLength(5);
    expect((await stored(IP_HIT.key))?.count).toBe(50);
    expect((await stored(PAIR_HIT.key))?.count).toBe(30);
    expect((await stored(IDENTIFIER_HIT.key))?.count).toBe(5);
  });

  it('refuses a key that is not 32 bytes and a count below 1 in SQL', async () => {
    const short = Buffer.alloc(31);

    await expect(prisma.$executeRaw`
      INSERT INTO auth_rate_limit (key, window_start, count)
      VALUES (${short}, ${T0.toISOString()}::timestamptz, 1)`).rejects.toThrow(
      'auth_rate_limit_key_length_check',
    );
    await expect(prisma.$executeRaw`
      INSERT INTO auth_rate_limit (key, window_start, count)
      VALUES (${IP_HIT.key}, ${T0.toISOString()}::timestamptz, 0)`).rejects.toThrow(
      'auth_rate_limit_count_check',
    );
  });
});
