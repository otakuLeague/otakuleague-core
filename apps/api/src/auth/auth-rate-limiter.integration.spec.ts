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
  rateLimitKey,
  type RateLimitKey,
  type RateLimitRule,
} from './auth-rate-limit-rules';
import { AuthRateLimiter, type RateLimitCounter } from './auth-rate-limiter';
import { normaliseIdentifier } from './credential-rules';

const T0 = new Date('2026-11-15T10:00:00.000Z');
const WINDOW_MS = 15 * 60_000;
const RULE: RateLimitRule = { limit: 3, windowMs: WINDOW_MS };
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

describe('AuthRateLimiter on Postgres', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limiter: AuthRateLimiter;
  const clock = new MovableClock();

  async function storedCount(key: RateLimitKey): Promise<number | null> {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count FROM auth_rate_limit WHERE key = ${key}`;
    return row?.count ?? null;
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

  it('counts 1, 2, 3... within one window, keeping its start', async () => {
    const counters: RateLimitCounter[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      clock.setOffset(attempt * 1000);
      counters.push(await limiter.hit(IP_KEY, RULE));
    }

    expect(counters).toEqual(
      [1, 2, 3, 4, 5].map((count) => ({ count, windowStart: T0 })),
    );
  });

  it('allows up to the limit, then refuses with the rest of the window', async () => {
    const hits = [{ key: IP_KEY, rule: RULE }] as const;
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      expect(await limiter.check(hits)).toEqual({ kind: 'allowed' });
    }
    clock.setOffset(60_000);

    expect(await limiter.check(hits)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 840,
    });
  });

  it('starts a new window exactly when the old one ends, not a millisecond before', async () => {
    await limiter.hit(IP_KEY, RULE);
    clock.setOffset(WINDOW_MS - 1);
    expect(await limiter.hit(IP_KEY, RULE)).toEqual({
      count: 2,
      windowStart: T0,
    });

    clock.setOffset(WINDOW_MS);
    expect(await limiter.hit(IP_KEY, RULE)).toEqual({
      count: 1,
      windowStart: new Date(T0.getTime() + WINDOW_MS),
    });
  });

  it('lets a refused key in again once its window has ended', async () => {
    const hits = [{ key: IP_KEY, rule: RULE }] as const;
    for (let attempt = 0; attempt <= RULE.limit; attempt += 1) {
      await limiter.check(hits);
    }
    clock.setOffset(WINDOW_MS);

    expect(await limiter.check(hits)).toEqual({ kind: 'allowed' });
  });

  it('gives 50 concurrent hits on one key the counts 1 to 50, each once', async () => {
    const counters = await Promise.all(
      Array.from({ length: 50 }, () => limiter.hit(IP_KEY, RULE)),
    );

    expect(counters.map(({ count }) => count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(await storedCount(IP_KEY)).toBe(50);
  });

  it('stops at the first refusal and leaves the later keys untouched', async () => {
    const hits = [
      { key: IP_KEY, rule: { limit: 10, windowMs: WINDOW_MS } },
      { key: PAIR_KEY, rule: { limit: 1, windowMs: WINDOW_MS } },
      { key: IDENTIFIER_KEY, rule: { limit: 10, windowMs: WINDOW_MS } },
    ] as const;

    expect(await limiter.check(hits)).toEqual({ kind: 'allowed' });
    expect(await limiter.check(hits)).toMatchObject({ kind: 'limited' });
    expect(await limiter.check(hits)).toMatchObject({ kind: 'limited' });

    expect(await storedCount(IP_KEY)).toBe(3);
    expect(await storedCount(PAIR_KEY)).toBe(3);
    expect(await storedCount(IDENTIFIER_KEY)).toBe(1);
  });

  it('keeps keys apart: counting one never moves another', async () => {
    await limiter.hit(IP_KEY, RULE);
    await limiter.hit(IP_KEY, RULE);

    expect(await storedCount(IP_KEY)).toBe(2);
    expect(await storedCount(PAIR_KEY)).toBeNull();
  });

  it('refuses a key that is not 32 bytes and a count below 1 in SQL', async () => {
    const short = Buffer.alloc(31);

    await expect(prisma.$executeRaw`
      INSERT INTO auth_rate_limit (key, window_start, count)
      VALUES (${short}, ${T0}, 1)`).rejects.toThrow(
      'auth_rate_limit_key_length_check',
    );
    await expect(prisma.$executeRaw`
      INSERT INTO auth_rate_limit (key, window_start, count)
      VALUES (${IP_KEY}, ${T0}, 0)`).rejects.toThrow(
      'auth_rate_limit_count_check',
    );
  });
});
