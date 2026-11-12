import { describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import {
  IMPORT_BURST,
  IMPORT_REFILL_MS,
  ImportLimits,
  NOT_FOUND_TTL_MS,
} from './import-limits';
import type { AnimeRef } from './sources/source.types';

class MovableClock extends Clock {
  private instant = new Date('2026-11-12T12:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}

function setup(): { clock: MovableClock; limits: ImportLimits } {
  const clock = new MovableClock();
  return { clock, limits: new ImportLimits(clock) };
}

function drain(limits: ImportLimits): void {
  while (limits.takeImportToken());
}

describe('ImportLimits tokens', () => {
  it('allows 10 imports at once and refuses the 11th', () => {
    const { limits } = setup();
    const taken = Array.from({ length: IMPORT_BURST + 1 }, () =>
      limits.takeImportToken(),
    );

    expect(taken.filter(Boolean)).toHaveLength(IMPORT_BURST);
    expect(taken.at(-1)).toBe(false);
  });

  it('gives one token back at exactly 20 s, none at 19,999 ms', () => {
    const { clock, limits } = setup();
    drain(limits);

    clock.advance(IMPORT_REFILL_MS - 1);
    expect(limits.takeImportToken()).toBe(false);
    clock.advance(1);
    expect(limits.takeImportToken()).toBe(true);
    expect(limits.takeImportToken()).toBe(false);
  });

  it('never holds more than 10 after a long idle', () => {
    const { clock, limits } = setup();
    drain(limits);
    clock.advance(30 * 24 * 60 * 60 * 1000);

    const taken = Array.from({ length: IMPORT_BURST + 5 }, () =>
      limits.takeImportToken(),
    ).filter(Boolean);
    expect(taken).toHaveLength(IMPORT_BURST);
  });

  it('does not bank idle time on a full bucket', () => {
    const { clock, limits } = setup();
    clock.advance(IMPORT_REFILL_MS - 1);
    drain(limits);
    expect(limits.takeImportToken()).toBe(false);

    clock.advance(1);
    expect(limits.takeImportToken()).toBe(false);
    clock.advance(IMPORT_REFILL_MS - 1);
    expect(limits.takeImportToken()).toBe(true);
  });

  it('keeps the partial step, so slow takers still get one per 20 s', () => {
    const { clock, limits } = setup();
    drain(limits);
    clock.advance(IMPORT_REFILL_MS + 5_000);
    expect(limits.takeImportToken()).toBe(true);

    clock.advance(IMPORT_REFILL_MS - 5_000);
    expect(limits.takeImportToken()).toBe(true);
  });

  it('ignores a clock that moves backwards', () => {
    const { clock, limits } = setup();
    drain(limits);

    clock.advance(-IMPORT_REFILL_MS * 3);
    expect(limits.takeImportToken()).toBe(false);
  });
});

describe('ImportLimits not-found memory', () => {
  const ref: AnimeRef = { source: 'anilist', externalId: 5 };

  it('knows an id at 59:59 and forgets it at exactly 1 h', () => {
    const { clock, limits } = setup();
    expect(limits.isKnownMissing(ref)).toBe(false);
    limits.rememberMissing(ref);

    clock.advance(NOT_FOUND_TTL_MS - 1);
    expect(limits.isKnownMissing(ref)).toBe(true);
    clock.advance(1);
    expect(limits.isKnownMissing(ref)).toBe(false);
  });

  it('keeps the same number apart per id source', () => {
    const { limits } = setup();
    limits.rememberMissing(ref);

    expect(
      limits.isKnownMissing({ source: 'myanimelist', externalId: 5 }),
    ).toBe(false);
  });

  it('restarts the hour when an id is remembered again', () => {
    const { clock, limits } = setup();
    limits.rememberMissing(ref);
    clock.advance(NOT_FOUND_TTL_MS - 1);
    limits.rememberMissing(ref);

    clock.advance(NOT_FOUND_TTL_MS - 1);
    expect(limits.isKnownMissing(ref)).toBe(true);
  });

  it('drops expired entries when a new one is inserted', () => {
    const { clock, limits } = setup();
    limits.rememberMissing(ref);
    clock.advance(NOT_FOUND_TTL_MS);
    limits.rememberMissing({ source: 'anilist', externalId: 6 });

    const entries = (limits as unknown as { missing: Map<string, number> })
      .missing;
    expect([...entries.keys()]).toEqual(['anilist:6']);
  });
});
