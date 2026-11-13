import { describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import {
  LIST_FETCH_BURST,
  LIST_FETCH_REFILL_MS,
  ListFetchLimits,
} from './list-fetch-limits';

class MovableClock extends Clock {
  private instant = new Date('2026-11-12T12:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}

const drain = (limits: ListFetchLimits) => {
  while (limits.take());
};

describe('ListFetchLimits', () => {
  it('allows the burst at once and refuses the next', () => {
    const limits = new ListFetchLimits(new MovableClock());
    const taken = Array.from({ length: LIST_FETCH_BURST + 1 }, () =>
      limits.take(),
    );

    expect(taken.filter(Boolean)).toHaveLength(LIST_FETCH_BURST);
    expect(taken.at(-1)).toBe(false);
  });

  it('gives one token back per refill step, not before', () => {
    const clock = new MovableClock();
    const limits = new ListFetchLimits(clock);
    drain(limits);

    clock.advance(LIST_FETCH_REFILL_MS - 1);
    expect(limits.take()).toBe(false);
    clock.advance(1);
    expect(limits.take()).toBe(true);
    expect(limits.take()).toBe(false);
  });

  it('never holds more than the burst after a long idle time', () => {
    const clock = new MovableClock();
    const limits = new ListFetchLimits(clock);
    drain(limits);

    clock.advance(24 * 3_600_000);
    const taken = Array.from({ length: LIST_FETCH_BURST + 1 }, () =>
      limits.take(),
    );

    expect(taken.filter(Boolean)).toHaveLength(LIST_FETCH_BURST);
  });

  it('banks no partial step while the bucket is full', () => {
    const clock = new MovableClock();
    const limits = new ListFetchLimits(clock);

    clock.advance(LIST_FETCH_REFILL_MS - 100);
    limits.take();
    for (let index = 1; index < LIST_FETCH_BURST; index += 1) limits.take();
    expect(limits.take()).toBe(false);

    clock.advance(LIST_FETCH_REFILL_MS - 1);
    expect(limits.take()).toBe(false);
    clock.advance(1);
    expect(limits.take()).toBe(true);
  });

  it('takes a given-back token again, never above the burst', () => {
    const limits = new ListFetchLimits(new MovableClock());
    limits.take();
    limits.giveBack();
    limits.giveBack();

    const taken = Array.from({ length: LIST_FETCH_BURST + 1 }, () =>
      limits.take(),
    );

    expect(taken.filter(Boolean)).toHaveLength(LIST_FETCH_BURST);
  });
});
