import { Injectable } from '@nestjs/common';
import type { VisitorKey } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import { VisitorBuckets, type VisitorTake } from '../common/visitor-buckets';

/** Cold list fetches allowed at once, and the most the bucket ever holds. */
export const LIST_FETCH_BURST = 6;
/** One list-fetch token comes back every this many milliseconds (6 a minute). */
export const LIST_FETCH_REFILL_MS = 10_000;
/** Cold list fetches one visitor may start at once (ADR 0019 addendum, OTA-189). */
export const LIST_VISITOR_BURST = 3;
/** One visitor token comes back every this many milliseconds (3 a minute). */
export const LIST_VISITOR_REFILL_MS = 20_000;
/** The most visitors remembered at once; the least recently used goes first. */
const LIST_VISITOR_MAX_ENTRIES = 10_000;

/**
 * A global token bucket for catalog-list fetches of pages we do not hold, and for the
 * background refreshes of stale ones (ADR 0016 addendum, OTA-177): the filters make about
 * 8,500 keys reachable, and AniList's budget is shared with imports. Stored pages cost no
 * token. In memory, per process: a restart refills it.
 */
@Injectable()
export class ListFetchLimits {
  private tokens = LIST_FETCH_BURST;
  private refilledAt: number;
  private readonly visitors: VisitorBuckets;

  constructor(private readonly clock: Clock) {
    this.refilledAt = clock.now().getTime();
    this.visitors = new VisitorBuckets(
      {
        burst: LIST_VISITOR_BURST,
        refillMs: LIST_VISITOR_REFILL_MS,
        maxEntries: LIST_VISITOR_MAX_ENTRIES,
      },
      clock,
    );
  }

  /** Takes one of this visitor's tokens; the global one is taken after it. */
  takeVisitor(key: VisitorKey): VisitorTake {
    return this.visitors.take(key);
  }

  /** Forgets visitors idle long enough to hold a full bucket again (OTA-197). */
  forgetIdleVisitors(): void {
    this.visitors.forgetIdle();
  }

  /** Visitors remembered right now (tests and the sweep guard). */
  visitorCount(): number {
    return this.visitors.size();
  }

  /** Returns a visitor token taken for a fetch that never reached AniList (never above the burst). */
  giveBackVisitor(key: VisitorKey): void {
    this.visitors.giveBack(key);
  }

  /** Takes one token; false when the bucket is empty. */
  take(): boolean {
    const now = this.clock.now().getTime();
    const steps = Math.floor(
      Math.max(0, now - this.refilledAt) / LIST_FETCH_REFILL_MS,
    );
    if (this.tokens === LIST_FETCH_BURST) {
      // Idle time on a full bucket must not bank a partial step towards the next token.
      this.refilledAt = Math.max(this.refilledAt, now);
    } else if (steps > 0) {
      this.tokens = Math.min(LIST_FETCH_BURST, this.tokens + steps);
      this.refilledAt =
        this.tokens === LIST_FETCH_BURST
          ? now
          : this.refilledAt + steps * LIST_FETCH_REFILL_MS;
    }
    if (this.tokens === 0) return false;
    this.tokens -= 1;
    return true;
  }

  /** Returns a token taken for a fetch that never reached AniList (never above the burst). */
  giveBack(): void {
    this.tokens = Math.min(LIST_FETCH_BURST, this.tokens + 1);
  }
}
