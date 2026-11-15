import { Injectable } from '@nestjs/common';
import type { VisitorKey } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import { VisitorBuckets, type VisitorTake } from '../common/visitor-buckets';

/** Searches one visitor may run at once, and the most the bucket ever holds. */
export const SEARCH_VISITOR_BURST = 20;
/** One search token comes back every this many milliseconds (30 a minute). */
export const SEARCH_VISITOR_REFILL_MS = 2_000;
/** The most visitors remembered at once; the least recently used goes first. */
const SEARCH_VISITOR_MAX_ENTRIES = 10_000;

/**
 * The per-visitor limit on `GET /anime/search` (ADR 0019 addendum, OTA-196). Search never
 * calls a source, so there is no global bucket and no give-back: a token stands for
 * database load. In memory, per process: a restart refills it.
 */
@Injectable()
export class SearchLimits {
  private readonly visitors: VisitorBuckets;

  constructor(clock: Clock) {
    this.visitors = new VisitorBuckets(
      {
        burst: SEARCH_VISITOR_BURST,
        refillMs: SEARCH_VISITOR_REFILL_MS,
        maxEntries: SEARCH_VISITOR_MAX_ENTRIES,
      },
      clock,
    );
  }

  /** Takes one of this visitor's tokens. */
  takeVisitor(key: VisitorKey): VisitorTake {
    return this.visitors.take(key);
  }
}
