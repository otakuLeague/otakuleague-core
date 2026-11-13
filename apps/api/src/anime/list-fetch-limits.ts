import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';

/** Cold list fetches allowed at once, and the most the bucket ever holds. */
export const LIST_FETCH_BURST = 6;
/** One list-fetch token comes back every this many milliseconds (6 a minute). */
export const LIST_FETCH_REFILL_MS = 10_000;

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

  constructor(private readonly clock: Clock) {
    this.refilledAt = clock.now().getTime();
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
}
