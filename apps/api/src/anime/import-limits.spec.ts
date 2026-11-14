import { describe, expect, it } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import {
  IMPORT_BURST,
  IMPORT_REFILL_MS,
  ImportLimits,
  MAX_VISITOR_ENTRIES,
  NOT_FOUND_TTL_MS,
  refillBucket,
  VISITOR_IDLE_MS,
  VISITOR_IMPORT_BURST,
  VISITOR_IMPORT_REFILL_MS,
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

  it('takes back a given-back token, but never holds more than 10', () => {
    const { limits } = setup();
    drain(limits);
    limits.giveBackImportToken();

    expect(limits.takeImportToken()).toBe(true);
    expect(limits.takeImportToken()).toBe(false);

    const full = setup().limits;
    full.giveBackImportToken();
    full.giveBackImportToken();
    const taken = Array.from({ length: IMPORT_BURST + 2 }, () =>
      full.takeImportToken(),
    ).filter(Boolean);
    expect(taken).toHaveLength(IMPORT_BURST);
  });
});

describe('refillBucket', () => {
  it.each([
    [
      'nothing before a whole step',
      { tokens: 0, refilledAt: 0 },
      39_999,
      { tokens: 0, refilledAt: 0 },
    ],
    [
      'one token per whole step, keeping the partial one',
      { tokens: 0, refilledAt: 0 },
      85_000,
      { tokens: 2, refilledAt: 80_000 },
    ],
    [
      'never more than the burst',
      { tokens: 3, refilledAt: 0 },
      10_000_000,
      { tokens: 5, refilledAt: 10_000_000 },
    ],
    [
      'no banked idle time on a full bucket',
      { tokens: 5, refilledAt: 0 },
      70_000,
      { tokens: 5, refilledAt: 70_000 },
    ],
    [
      'nothing for a clock that moved backwards',
      { tokens: 1, refilledAt: 50_000 },
      0,
      { tokens: 1, refilledAt: 50_000 },
    ],
  ])('gives %s', (_, bucket, now, expected) => {
    expect(refillBucket(bucket, now, 5, 40_000)).toEqual(expected);
  });
});

describe('ImportLimits visitor buckets', () => {
  const alice = visitorKeyFromClientIp('203.0.113.7');
  const bob = visitorKeyFromClientIp('2001:db8:1:2::9');

  function drainVisitor(limits: ImportLimits, key = alice): void {
    while (limits.takeVisitorToken(key).taken);
  }

  it('allows 5 imports at once and refuses the 6th', () => {
    const { limits } = setup();
    const takes = Array.from({ length: VISITOR_IMPORT_BURST + 1 }, () =>
      limits.takeVisitorToken(alice),
    );

    expect(takes.slice(0, VISITOR_IMPORT_BURST)).toEqual(
      Array.from({ length: VISITOR_IMPORT_BURST }, () => ({ taken: true })),
    );
    expect(takes.at(-1)).toEqual({ taken: false, retryAfterSeconds: 40 });
  });

  it.each([
    [0, 40],
    [1, 40],
    [39_001, 1],
    [39_999, 1],
  ])('answers Retry-After at +%i ms with %i s', (elapsed, seconds) => {
    const { clock, limits } = setup();
    drainVisitor(limits);

    clock.advance(elapsed);
    expect(limits.takeVisitorToken(alice)).toEqual({
      taken: false,
      retryAfterSeconds: seconds,
    });
  });

  it('grants the next token at exactly 40 s', () => {
    const { clock, limits } = setup();
    drainVisitor(limits);

    clock.advance(VISITOR_IMPORT_REFILL_MS);
    expect(limits.takeVisitorToken(alice)).toEqual({ taken: true });
    expect(limits.takeVisitorToken(alice).taken).toBe(false);
  });

  it('never answers more than 40 s when the clock moves backwards', () => {
    const { clock, limits } = setup();
    drainVisitor(limits);

    clock.advance(-10 * VISITOR_IMPORT_REFILL_MS);
    expect(limits.takeVisitorToken(alice)).toEqual({
      taken: false,
      retryAfterSeconds: 40,
    });
  });

  it('keeps visitors apart, and leaves the global bucket alone', () => {
    const { limits } = setup();
    drainVisitor(limits, alice);

    expect(limits.takeVisitorToken(bob)).toEqual({ taken: true });
    expect(limits.takeImportToken()).toBe(true);
  });

  it('does not bank idle time on a full visitor bucket', () => {
    const { clock, limits } = setup();
    limits.takeVisitorToken(alice);
    limits.giveBackVisitorToken(alice);
    clock.advance(VISITOR_IMPORT_REFILL_MS - 1);
    drainVisitor(limits);

    clock.advance(1);
    expect(limits.takeVisitorToken(alice).taken).toBe(false);
    clock.advance(VISITOR_IMPORT_REFILL_MS - 1);
    expect(limits.takeVisitorToken(alice).taken).toBe(true);
  });

  it('gives a token back, never above 5, and ignores a visitor it does not hold', () => {
    const { limits } = setup();
    drainVisitor(limits);
    limits.giveBackVisitorToken(alice);
    expect(limits.takeVisitorToken(alice)).toEqual({ taken: true });
    expect(limits.takeVisitorToken(alice).taken).toBe(false);

    limits.takeVisitorToken(bob);
    for (let i = 0; i < 3; i += 1) limits.giveBackVisitorToken(bob);
    const takes = Array.from({ length: VISITOR_IMPORT_BURST + 1 }, () =>
      limits.takeVisitorToken(bob),
    ).filter(({ taken }) => taken);
    expect(takes).toHaveLength(VISITOR_IMPORT_BURST);

    const unknownVisitor = visitorKeyFromClientIp('198.51.100.1');
    limits.giveBackVisitorToken(unknownVisitor);
    expect(limits.visitorCount()).toBe(2);
  });

  it('drops a visitor 200 s after its last take, and keeps one used since', () => {
    const { clock, limits } = setup();
    limits.takeVisitorToken(alice);
    clock.advance(100_000);
    limits.takeVisitorToken(bob);

    clock.advance(VISITOR_IDLE_MS - 100_000 - 1);
    limits.takeVisitorToken(bob);
    expect(limits.visitorCount()).toBe(2);

    clock.advance(1);
    limits.takeVisitorToken(bob);
    expect(limits.visitorCount()).toBe(1);
    // A dropped entry was a full bucket: the visitor starts again with 5.
    const takes = Array.from({ length: VISITOR_IMPORT_BURST + 1 }, () =>
      limits.takeVisitorToken(alice),
    ).filter(({ taken }) => taken);
    expect(takes).toHaveLength(VISITOR_IMPORT_BURST);
  });

  it('does not keep a refused visitor alive: only a granted take counts as use', () => {
    const { clock, limits } = setup();
    drainVisitor(limits);
    clock.advance(VISITOR_IMPORT_REFILL_MS - 1);
    expect(limits.takeVisitorToken(alice).taken).toBe(false);

    clock.advance(VISITOR_IDLE_MS - VISITOR_IMPORT_REFILL_MS + 1);
    limits.takeVisitorToken(bob);
    expect(limits.visitorCount()).toBe(1);
  });

  it(`remembers at most ${MAX_VISITOR_ENTRIES} visitors, dropping the least recently used`, () => {
    const { limits } = setup();
    const keyOf = (n: number) =>
      visitorKeyFromClientIp(
        `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`,
      );
    const left = (key: ReturnType<typeof keyOf>) =>
      Array.from({ length: VISITOR_IMPORT_BURST }, () =>
        limits.takeVisitorToken(key),
      ).filter(({ taken }) => taken).length;
    limits.takeVisitorToken(alice);
    for (let n = 0; n < MAX_VISITOR_ENTRIES - 1; n += 1) {
      limits.takeVisitorToken(keyOf(n));
    }
    expect(limits.visitorCount()).toBe(MAX_VISITOR_ENTRIES);
    // Alice is used again, so keyOf(0) is now the least recently used.
    limits.takeVisitorToken(alice);

    limits.takeVisitorToken(bob);
    expect(limits.visitorCount()).toBe(MAX_VISITOR_ENTRIES);
    expect(left(alice)).toBe(VISITOR_IMPORT_BURST - 2);
    // Evicted, so it starts again from a full bucket.
    expect(left(keyOf(0))).toBe(VISITOR_IMPORT_BURST);
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
