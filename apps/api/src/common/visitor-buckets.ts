import type { VisitorKey } from './api-caller';
import type { Clock } from './clock-and-random.module';

/** Tokens left, and the instant the last whole refill step was counted from. */
export interface TokenBucket {
  readonly tokens: number;
  readonly refilledAt: number;
}

interface VisitorEntry extends TokenBucket {
  /** The last granted take: entries are kept in this order and dropped once idle. */
  readonly takenAt: number;
}

/** Whether a visitor may start some work, and if not, when to try again (ADR 0019 item 12). */
export type VisitorTake =
  | { readonly taken: true }
  | { readonly taken: false; readonly retryAfterSeconds: number };

/** The numbers of one keyed limiter: bucket size, refill step and the most keys remembered. */
export interface VisitorBucketsConfig {
  readonly burst: number;
  readonly refillMs: number;
  readonly maxEntries: number;
}

/**
 * The bucket as it stands at `now`: one token per whole `refillMs` since `refilledAt`, never more
 * than `burst`. A full bucket banks no idle time, so the next token after a drain always takes a
 * whole step; a clock that moves backwards adds nothing. Pure, shared by both kinds of bucket.
 */
export function refillBucket(
  bucket: TokenBucket,
  now: number,
  burst: number,
  refillMs: number,
): TokenBucket {
  if (bucket.tokens >= burst) {
    return { tokens: burst, refilledAt: Math.max(bucket.refilledAt, now) };
  }
  const steps = Math.floor(Math.max(0, now - bucket.refilledAt) / refillMs);
  if (steps === 0) return bucket;
  const tokens = Math.min(burst, bucket.tokens + steps);
  return {
    tokens,
    refilledAt: tokens === burst ? now : bucket.refilledAt + steps * refillMs,
  };
}

/** Whole seconds until an empty bucket's next token: 1 to refillMs / 1000, also if the clock jumped. */
function secondsUntilNextToken(
  bucket: TokenBucket,
  now: number,
  refillMs: number,
): number {
  const waitMs = bucket.refilledAt + refillMs - now;
  return Math.min(
    Math.ceil(refillMs / 1000),
    Math.max(1, Math.ceil(waitMs / 1000)),
  );
}

/**
 * The one keyed token-bucket limiter (ADR 0019): a bucket per visitor key, in memory, per
 * process. Entries are kept in last-granted-take order; an entry idle for burst * refillMs is a
 * full bucket again and is dropped (on the next granted take, and by the timed sweep of
 * `forgetIdle`, ADR 0019 retention addendum, OTA-197), and over `maxEntries` the least recently
 * used goes first.
 * Keys are client IPs: never log them.
 */
export class VisitorBuckets {
  private readonly entries = new Map<VisitorKey, VisitorEntry>();
  private readonly idleMs: number;

  constructor(
    private readonly config: VisitorBucketsConfig,
    private readonly clock: Clock,
  ) {
    this.idleMs = config.burst * config.refillMs;
  }

  /** Takes one of this key's tokens. Only a granted take stamps the entry and moves it to the end. */
  take(key: VisitorKey): VisitorTake {
    const { burst, refillMs, maxEntries } = this.config;
    const now = this.now();
    const bucket = refillBucket(
      this.entries.get(key) ?? { tokens: burst, refilledAt: now },
      now,
      burst,
      refillMs,
    );
    if (bucket.tokens === 0) {
      return {
        taken: false,
        retryAfterSeconds: secondsUntilNextToken(bucket, now, refillMs),
      };
    }
    this.dropIdle(now);
    this.entries.delete(key);
    this.entries.set(key, {
      tokens: bucket.tokens - 1,
      refilledAt: bucket.refilledAt,
      takenAt: now,
    });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= maxEntries) break;
      this.entries.delete(oldest);
    }
    return { taken: true };
  }

  /** Returns a token no work was spent on: never above the burst, nothing for a dropped entry. */
  giveBack(key: VisitorKey): void {
    const stored = this.entries.get(key);
    // Evicted between take and give-back: nothing to return, and nothing lost, since a key
    // without an entry starts again from a full bucket.
    if (stored === undefined) return;
    const { burst, refillMs } = this.config;
    const bucket = refillBucket(stored, this.now(), burst, refillMs);
    // Same place in the order and same takenAt: a give-back is not a use.
    this.entries.set(key, {
      tokens: Math.min(burst, bucket.tokens + 1),
      refilledAt: bucket.refilledAt,
      takenAt: stored.takenAt,
    });
  }

  /** Keys remembered right now (tests and the memory bound of ADR 0019). */
  size(): number {
    return this.entries.size;
  }

  /** Drops every idle entry now, with no take needed: the timed sweep of OTA-197 calls this. */
  forgetIdle(): void {
    this.dropIdle(this.now());
  }

  /** Idle entries are full buckets: dropping them changes no answer. */
  private dropIdle(now: number): void {
    for (const [key, entry] of this.entries) {
      // Stamped in the future: the clock stepped backwards, so it is idle however long ago.
      const idle = entry.takenAt > now || now - entry.takenAt >= this.idleMs;
      if (!idle) break;
      this.entries.delete(key);
    }
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}
