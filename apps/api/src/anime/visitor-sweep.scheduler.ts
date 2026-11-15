import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ImportLimits } from './import-limits';
import { ListFetchLimits } from './list-fetch-limits';
import { SearchLimits } from './search-limits';

/** How often idle visitor IPs are swept out of memory (ADR 0019 retention addendum, OTA-197). */
export const VISITOR_SWEEP_INTERVAL_MS = 60_000;

/**
 * Forgets idle visitor keys on a timer, so a raw IP does not wait for the next granted take.
 * Every owner of a `VisitorBuckets` must be swept here: a new per-visitor limiter is added to
 * the constructor and to `sweep`, and the retention bound in the spec covers its numbers. The
 * timer never keeps the process alive and logs nothing: keys are client IPs.
 */
@Injectable()
export class VisitorSweepScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly imports: ImportLimits,
    private readonly lists: ListFetchLimits,
    private readonly searches: SearchLimits,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.sweep(), VISITOR_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private sweep(): void {
    this.imports.forgetIdleVisitors();
    this.lists.forgetIdleVisitors();
    this.searches.forgetIdleVisitors();
  }
}
