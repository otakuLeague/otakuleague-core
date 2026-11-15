import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import {
  ImportLimits,
  VISITOR_IMPORT_BURST,
  VISITOR_IMPORT_REFILL_MS,
} from './import-limits';
import {
  LIST_VISITOR_BURST,
  LIST_VISITOR_REFILL_MS,
  ListFetchLimits,
} from './list-fetch-limits';
import {
  SEARCH_VISITOR_BURST,
  SEARCH_VISITOR_REFILL_MS,
  SearchLimits,
} from './search-limits';
import {
  VISITOR_SWEEP_INTERVAL_MS,
  VisitorSweepScheduler,
} from './visitor-sweep.scheduler';

const FIVE_MINUTES_MS = 5 * 60_000;

class StillClock extends Clock {
  now(): Date {
    return new Date('2026-11-15T12:00:00.000Z');
  }
}

function setup() {
  const clock = new StillClock();
  const imports = new ImportLimits(clock);
  const lists = new ListFetchLimits(clock);
  const searches = new SearchLimits(clock);
  const spies = [
    vi.spyOn(imports, 'forgetIdleVisitors'),
    vi.spyOn(lists, 'forgetIdleVisitors'),
    vi.spyOn(searches, 'forgetIdleVisitors'),
  ];
  return {
    scheduler: new VisitorSweepScheduler(imports, lists, searches),
    spies,
  };
}

describe('VisitorSweepScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeps nothing before the interval and all three limiters at it', () => {
    const { scheduler, spies } = setup();
    scheduler.onModuleInit();

    vi.advanceTimersByTime(VISITOR_SWEEP_INTERVAL_MS - 1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(VISITOR_SWEEP_INTERVAL_MS);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
  });

  it('stops sweeping once destroyed, and destroying twice is harmless', () => {
    const { scheduler, spies } = setup();
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    scheduler.onModuleDestroy();

    vi.advanceTimersByTime(VISITOR_SWEEP_INTERVAL_MS * 3);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('does not keep the process alive', () => {
    const { scheduler } = setup();
    scheduler.onModuleInit();
    expect(vi.getTimerCount()).toBe(1);
    scheduler.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('visitor IP retention promise (ADR 0019)', () => {
  it('forgets a raw IP within 5 minutes of the last granted request, for every limiter', () => {
    const idleWindows = [
      VISITOR_IMPORT_BURST * VISITOR_IMPORT_REFILL_MS,
      LIST_VISITOR_BURST * LIST_VISITOR_REFILL_MS,
      SEARCH_VISITOR_BURST * SEARCH_VISITOR_REFILL_MS,
    ];
    const worstCase = Math.max(...idleWindows) + VISITOR_SWEEP_INTERVAL_MS;
    expect(worstCase).toBeLessThanOrEqual(FIVE_MINUTES_MS);
  });
});
