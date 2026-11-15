import { Injectable } from '@nestjs/common';

/** Searches allowed to run at once in this process; the database pool has 10 connections. */
export const SEARCH_MAX_IN_FLIGHT = 4;

export type SearchRun<Value> =
  { readonly kind: 'busy' } | { readonly kind: 'done'; readonly value: Value };

/**
 * A cap on searches in flight (ADR 0019 addendum, OTA-199): a search runs in one
 * transaction, so it pins one pool connection and the cap keeps the rest (at least 6) for other routes. In memory,
 * per process, like the pool it protects. No queue: a search over the cap is refused at once.
 */
@Injectable()
export class SearchInFlight {
  private running = 0;

  /** Runs the task in a free slot, or answers `busy` without calling it. The slot is always given back. */
  async run<Value>(task: () => Promise<Value>): Promise<SearchRun<Value>> {
    if (this.running >= SEARCH_MAX_IN_FLIGHT) return { kind: 'busy' };
    this.running += 1;
    try {
      return { kind: 'done', value: await task() };
    } finally {
      this.running -= 1;
    }
  }
}
