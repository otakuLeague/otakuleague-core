import { describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import { relationsKey } from './franchise-walker.service';
import { BACKOFF_STEPS_MS, backoffKey, SourceBackoff } from './source-backoff';

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
  it('backs an entry off for 1 h, 6 h, 1 d, then 7 d on repeated bad answers, and only that entry', () => {
    const clock = new MovableClock();
    const backoff = new SourceBackoff(clock);
    const waits: number[] = [];
    for (let answer = 0; answer < 5; answer += 1) {
      backoff.backOff('k');
      let waited = 0;
      while (backoff.isBackedOff('k')) {
        clock.advance(60 * 1000);
        waited += 60 * 1000;
      }
      waits.push(waited);
    }

    expect(waits).toEqual([...BACKOFF_STEPS_MS, BACKOFF_STEPS_MS.at(-1)]);
    expect(backoff.isBackedOff('other')).toBe(false);
  });

  it('is retrying on the early steps, settled on the last, and starts over once cleared', () => {
    const clock = new MovableClock();
    const backoff = new SourceBackoff(clock);
    const stages: string[] = [];
    for (let answer = 0; answer < 4; answer += 1) {
      backoff.backOff('k');
      stages.push(backoff.stage('k'));
      clock.advance(8 * 24 * 60 * 60 * 1000);
    }
    expect(stages).toEqual(['retrying', 'retrying', 'retrying', 'settled']);
    expect(backoff.stage('k')).toBe('clear');

    backoff.clear('k');
    backoff.backOff('k');
    clock.advance(BACKOFF_STEPS_MS[0]! - 1);
    expect(backoff.stage('k')).toBe('retrying');
    clock.advance(1);
    expect(backoff.stage('k')).toBe('clear');
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
