import { describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import { relationsKey } from './franchise-walker.service';
import { BACKOFF_MS, backoffKey, SourceBackoff } from './source-backoff';

class MovableClock extends Clock {
  private instant = new Date('2026-10-16T12:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}

describe('SourceBackoff', () => {
  it('backs an entry off until exactly BACKOFF_MS later, and only that entry', () => {
    const clock = new MovableClock();
    const backoff = new SourceBackoff(clock);
    backoff.backOff('anilist:anilist:1');

    clock.advance(BACKOFF_MS - 1);
    expect(backoff.isBackedOff('anilist:anilist:1')).toBe(true);
    expect(backoff.isBackedOff('anilist:anilist:2')).toBe(false);
    clock.advance(1);
    expect(backoff.isBackedOff('anilist:anilist:1')).toBe(false);
  });

  it('forgets the oldest live entry when full, keeping the newer ones', () => {
    const backoff = new SourceBackoff(new MovableClock());
    for (let id = 0; id <= 10_000; id += 1) backoff.backOff(`k${id}`);

    expect(backoff.isBackedOff('k0')).toBe(false);
    expect(backoff.isBackedOff('k1')).toBe(true);
    expect(backoff.isBackedOff('k10000')).toBe(true);
  });

  it('keeps a relations omission from blocking the import of the same anime', () => {
    const backoff = new SourceBackoff(new MovableClock());
    const animeKey = backoffKey('anime', 'anilist', {
      source: 'anilist',
      externalId: 16498,
    });

    backoff.backOff(relationsKey(16498));

    expect(backoff.isBackedOff(relationsKey(16498))).toBe(true);
    expect(backoff.isBackedOff(animeKey)).toBe(false);
  });
});
