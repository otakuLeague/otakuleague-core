import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';

/** A clock that moves only when the test says so; sleeps are recorded, not waited. */
function fakeTime(start = 1_000_000) {
  let now = start;
  const waits: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
    advance: (ms: number) => {
      now += ms;
    },
    waits,
  };
}

describe('RateLimiter', () => {
  it('spaces request starts by the minimum interval, in call order', async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(2_000, time.now, time.sleep);

    await Promise.all([
      limiter.acquire(Infinity),
      limiter.acquire(Infinity),
      limiter.acquire(Infinity),
    ]);

    // The first goes at once; the next ones are booked 2 s and 4 s later.
    expect(time.waits).toEqual([2_000, 4_000]);
  });

  it('does not wait when the interval has already passed', async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(1_000, time.now, time.sleep);

    await limiter.acquire(Infinity);
    time.advance(5_000);
    await limiter.acquire(Infinity);

    expect(time.waits).toEqual([]);
  });

  it('holds every request until a Retry-After pause ends', async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(1_000, time.now, time.sleep);

    limiter.pauseUntil(time.now() + 30_000);
    await limiter.acquire(Infinity);

    expect(time.waits).toEqual([30_000]);
  });

  it('reports a source as down for the cool-down, then up again', () => {
    const time = fakeTime();
    const limiter = new RateLimiter(1_000, time.now, time.sleep);

    limiter.markDown(60_000);
    expect(limiter.isDown()).toBe(true);
    time.advance(60_000);
    expect(limiter.isDown()).toBe(false);
  });

  it('refuses, without booking a slot, a caller that would wait longer than its budget', async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(2_000, time.now, time.sleep);

    await expect(limiter.acquire(0)).resolves.toBe(true);
    await expect(limiter.acquire(1_000)).resolves.toBe(false);
    // The refused call booked nothing: the next one waits one interval, not two.
    await expect(limiter.acquire(5_000)).resolves.toBe(true);
    expect(time.waits).toEqual([2_000]);
  });
});
