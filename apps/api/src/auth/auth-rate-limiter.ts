import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  decide,
  RATE_LIMIT_ALLOWED,
  type RateLimitDecision,
  type RateLimitHits,
  type RateLimitKey,
  type RateLimitRule,
} from './auth-rate-limit-rules';

/** A key's counter just after one attempt was counted. */
interface RateLimitCounter {
  readonly count: number;
  readonly windowStart: Date;
}

interface StoredCounter {
  readonly count: number;
  readonly windowStartMs: number;
}

/**
 * Auth attempt counters in Postgres (ADR 0015), so they survive a deploy: the one exception to
 * the in-memory VisitorBuckets rule. Never catches a database error: an outage is a 503, never
 * an uncounted attempt. Logs nothing.
 */
@Injectable()
export class AuthRateLimiter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * What a route calls, with keys from its builder (signInHits). Counts one attempt against
   * each key in order and stops at the first
   * refusal: a refused attempt never counts against the later keys (ADR 0015 lockout arithmetic:
   * with the per-IP key first, one IP alone cannot use up an identifier's hourly budget).
   */
  async check(hits: RateLimitHits): Promise<RateLimitDecision> {
    const now = this.clock.now();
    for (const { key, rule } of hits) {
      const { count, windowStart } = await this.count(key, rule, now);
      const decision = decide(count, windowStart, rule, now);
      if (decision.kind === 'limited') return decision;
    }
    return RATE_LIMIT_ALLOWED;
  }

  /**
   * One autocommit statement, atomic under concurrency: the first attempt inserts count 1; a
   * later one adds 1, or starts a new window at `now` with count 1 once the old one has ended.
   * Both CASEs read the row as it was before this update. Times go in with an explicit UTC
   * offset and come back as epoch milliseconds: the pg adapter drops a timestamptz offset when
   * reading, so a session time zone other than UTC would otherwise shift every window.
   */
  private async count(
    key: RateLimitKey,
    rule: RateLimitRule,
    now: Date,
  ): Promise<RateLimitCounter> {
    const start = now.toISOString();
    const ended = new Date(now.getTime() - rule.windowMs).toISOString();
    const [row] = await this.prisma.$queryRaw<StoredCounter[]>`
      INSERT INTO auth_rate_limit AS limits (key, window_start, count)
      VALUES (${key}, ${start}::timestamptz, 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN limits.window_start <= ${ended}::timestamptz
          THEN 1 ELSE limits.count + 1 END,
        window_start = CASE WHEN limits.window_start <= ${ended}::timestamptz
          THEN ${start}::timestamptz ELSE limits.window_start END
      RETURNING count,
        (extract(epoch FROM window_start) * 1000)::float8 AS "windowStartMs"`;
    if (row === undefined) {
      throw new Error('The rate-limit upsert returned no row');
    }
    return { count: row.count, windowStart: new Date(row.windowStartMs) };
  }
}
