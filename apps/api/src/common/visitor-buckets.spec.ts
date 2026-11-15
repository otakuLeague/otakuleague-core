import { describe, expect, it } from 'vitest';
import { visitorKeyFromClientIp } from './api-caller';
import { Clock } from './clock-and-random.module';
import { VisitorBuckets } from './visitor-buckets';

class MovableClock extends Clock {
  private instant = new Date('2026-11-12T12:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}

const A = visitorKeyFromClientIp('203.0.113.1');
const B = visitorKeyFromClientIp('203.0.113.2');

function setup(burst = 3, refillMs = 20_000, maxEntries = 10_000) {
  const clock = new MovableClock();
  const buckets = new VisitorBuckets({ burst, refillMs, maxEntries }, clock);
  return { clock, buckets };
}

describe('VisitorBuckets', () => {
  it('grants the burst, then refuses with the wait until the next token', () => {
    const { buckets } = setup();

    for (let index = 0; index < 3; index += 1) {
      expect(buckets.take(A)).toEqual({ taken: true });
    }

    expect(buckets.take(A)).toEqual({ taken: false, retryAfterSeconds: 20 });
  });

  it('keeps each key in its own bucket', () => {
    const { buckets } = setup(1);

    buckets.take(A);

    expect(buckets.take(A).taken).toBe(false);
    expect(buckets.take(B)).toEqual({ taken: true });
  });

  it('refills one token per whole step', () => {
    const { clock, buckets } = setup();
    for (let index = 0; index < 3; index += 1) buckets.take(A);

    clock.advance(19_999);
    expect(buckets.take(A).taken).toBe(false);
    clock.advance(1);

    expect(buckets.take(A)).toEqual({ taken: true });
    expect(buckets.take(A).taken).toBe(false);
  });

  it('reports a retry delay between 1 and refillMs / 1000 seconds', () => {
    const { clock, buckets } = setup();
    for (let index = 0; index < 3; index += 1) buckets.take(A);

    clock.advance(15_500);
    expect(buckets.take(A)).toEqual({ taken: false, retryAfterSeconds: 5 });
    clock.advance(4_499);
    expect(buckets.take(A)).toEqual({ taken: false, retryAfterSeconds: 1 });
  });

  it('keeps the delay within bounds when the clock jumps backwards', () => {
    const { clock, buckets } = setup();
    for (let index = 0; index < 3; index += 1) buckets.take(A);

    clock.advance(-3_600_000);

    expect(buckets.take(A)).toEqual({ taken: false, retryAfterSeconds: 20 });
  });

  it('gives a token back, never above the burst', () => {
    const { buckets } = setup(2);
    buckets.take(A);
    buckets.take(A);

    buckets.giveBack(A);
    buckets.giveBack(A);
    buckets.giveBack(A);

    expect(buckets.take(A).taken).toBe(true);
    expect(buckets.take(A).taken).toBe(true);
    expect(buckets.take(A).taken).toBe(false);
  });

  it('ignores a give-back for a key it does not remember', () => {
    const { buckets } = setup();

    buckets.giveBack(A);

    expect(buckets.size()).toBe(0);
  });

  it('drops an entry once its bucket has been idle for a full refill', () => {
    const { clock, buckets } = setup();
    buckets.take(A);
    clock.advance(60_000 - 1);
    buckets.take(B);
    expect(buckets.size()).toBe(2);

    clock.advance(1);
    buckets.take(B);

    expect(buckets.size()).toBe(1);
  });

  it('drops the least recently used entry first over the cap', () => {
    const { buckets } = setup(3, 20_000, 2);
    const C = visitorKeyFromClientIp('203.0.113.3');
    buckets.take(A);
    buckets.take(B);
    buckets.take(A);

    buckets.take(C);

    expect(buckets.size()).toBe(2);
    // B was the oldest and is gone: a full bucket again, so a give-back finds nothing.
    buckets.giveBack(B);
    expect(buckets.size()).toBe(2);
  });
});
