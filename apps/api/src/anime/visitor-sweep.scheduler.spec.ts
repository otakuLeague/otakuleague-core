import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
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

class MovableClock extends Clock {
  private instant = new Date('2026-11-15T12:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}

function setup() {
  const clock = new MovableClock();
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
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    scheduler.onModuleInit();
    const timer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    scheduler.onModuleDestroy();
    setIntervalSpy.mockRestore();
  });

  it('empties real limiters one interval after the largest idle window', () => {
    const clock = new MovableClock();
    const imports = new ImportLimits(clock);
    const lists = new ListFetchLimits(clock);
    const searches = new SearchLimits(clock);
    const key = visitorKeyFromClientIp('203.0.113.9');
    imports.takeVisitorToken(key);
    lists.takeVisitor(key);
    searches.takeVisitor(key);
    const scheduler = new VisitorSweepScheduler(imports, lists, searches);
    scheduler.onModuleInit();

    const idleMs = VISITOR_IMPORT_BURST * VISITOR_IMPORT_REFILL_MS;
    clock.advance(idleMs);
    vi.advanceTimersByTime(VISITOR_SWEEP_INTERVAL_MS);

    expect(imports.visitorCount()).toBe(0);
    expect(lists.visitorCount()).toBe(0);
    expect(searches.visitorCount()).toBe(0);
    scheduler.onModuleDestroy();
  });

  it('is the only owner of VisitorBuckets: every class that builds one is swept', () => {
    const root = join(__dirname, '..');
    const owners = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) =>
        readFileSync(join(root, f), 'utf8').includes('new VisitorBuckets('),
      )
      .map((f) => f.split('/').pop());
    expect(owners.sort()).toEqual([
      'import-limits.ts',
      'list-fetch-limits.ts',
      'search-limits.ts',
    ]);
    const scheduler = readFileSync(
      join(__dirname, 'visitor-sweep.scheduler.ts'),
      'utf8',
    );
    for (const cls of ['ImportLimits', 'ListFetchLimits', 'SearchLimits']) {
      expect(scheduler).toContain(`: ${cls}`);
    }
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
