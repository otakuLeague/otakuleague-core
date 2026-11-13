import {
  ANIME_LIST_KINDS,
  type AnimeListKind,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import {
  assembleWindow,
  decodeCursor,
  encodeCursor,
  type CatalogList,
  currentSeason,
  isFresh,
  listKey,
  listQuery,
  type ListFilters,
  readWindow,
  resolveCatalogList,
  type WindowBlock,
} from './anime-list.query';

const HOUR_MS = 3_600_000;

const NOV_2026 = new Date('2026-11-13T12:00:00Z');
const FALL_2026 = { season: 'FALL', year: 2026 } as const;
const plain = (kind: AnimeListKind): CatalogList => ({
  kind,
  season: null,
  genre: null,
});

describe('listQuery', () => {
  it('has the ADR 0016 filter and sort for every kind', () => {
    expect(
      ANIME_LIST_KINDS.map((kind) => [kind, listQuery(plain(kind))]),
    ).toEqual([
      ['trending', { sort: ['TRENDING_DESC', 'POPULARITY_DESC'] }],
      ['top', { sort: ['SCORE_DESC', 'POPULARITY_DESC'] }],
      ['upcoming', { sort: ['POPULARITY_DESC'], status: 'NOT_YET_RELEASED' }],
      ['airing', { sort: ['POPULARITY_DESC'], status: 'RELEASING' }],
      ['seasonal', { sort: ['POPULARITY_DESC'] }],
    ]);
  });

  it('adds the season, its year and the genre only when set', () => {
    expect(
      listQuery({ kind: 'seasonal', season: FALL_2026, genre: 'Drama' }),
    ).toEqual({
      sort: ['POPULARITY_DESC'],
      season: 'FALL',
      seasonYear: 2026,
      genre: 'Drama',
    });
    expect(listQuery({ ...plain('top'), genre: 'Sci-Fi' })).toEqual({
      sort: ['SCORE_DESC', 'POPULARITY_DESC'],
      genre: 'Sci-Fi',
    });
  });
});

describe('listKey', () => {
  it('keeps the kind alone as the key of an unfiltered list', () => {
    expect(listKey(plain('airing'))).toBe('airing');
  });

  it('appends season, year and genre in a fixed order', () => {
    expect(listKey({ kind: 'seasonal', season: FALL_2026, genre: null })).toBe(
      'seasonal|season=FALL|year=2026',
    );
    expect(listKey({ ...plain('top'), genre: 'Slice of Life' })).toBe(
      'top|genre=Slice of Life',
    );
    expect(
      listKey({ kind: 'seasonal', season: FALL_2026, genre: 'Drama' }),
    ).toBe('seasonal|season=FALL|year=2026|genre=Drama');
  });
});

describe('currentSeason', () => {
  it.each([
    ['2026-01-01T00:00:00Z', 'WINTER'],
    ['2026-03-31T23:59:59Z', 'WINTER'],
    ['2026-04-01T00:00:00Z', 'SPRING'],
    ['2026-06-30T23:59:59Z', 'SPRING'],
    ['2026-07-01T00:00:00Z', 'SUMMER'],
    ['2026-09-30T23:59:59Z', 'SUMMER'],
    ['2026-10-01T00:00:00Z', 'FALL'],
    ['2026-12-31T23:59:59Z', 'FALL'],
  ])('is the season of %s in UTC: %s', (instant, season) => {
    expect(currentSeason(new Date(instant))).toEqual({ season, year: 2026 });
  });
});

describe('resolveCatalogList', () => {
  const resolve = (kind: AnimeListKind, filters: ListFilters) =>
    resolveCatalogList(kind, filters, NOV_2026);

  it('resolves an unfiltered kind with no season and no genre', () => {
    expect(resolve('top', {})).toEqual({ outcome: 'ok', list: plain('top') });
  });

  it('keeps the genre of any kind', () => {
    expect(resolve('airing', { genre: 'Mecha' })).toEqual({
      outcome: 'ok',
      list: { ...plain('airing'), genre: 'Mecha' },
    });
  });

  it('defaults seasonal to the current UTC season', () => {
    expect(resolve('seasonal', {})).toEqual({
      outcome: 'ok',
      list: { kind: 'seasonal', season: FALL_2026, genre: null },
    });
  });

  it('resolves an explicit season to the same list as the default', () => {
    expect(resolve('seasonal', { season: 'FALL', year: 2026 })).toEqual(
      resolve('seasonal', {}),
    );
  });

  it('accepts the lowest year and next year, but not the one after', () => {
    expect(resolve('seasonal', { season: 'WINTER', year: 1917 }).outcome).toBe(
      'ok',
    );
    expect(resolve('seasonal', { season: 'WINTER', year: 2027 }).outcome).toBe(
      'ok',
    );
    expect(resolve('seasonal', { season: 'WINTER', year: 2028 })).toEqual({
      outcome: 'invalid',
      details: [{ field: 'year', message: 'year must be at most 2027' }],
    });
  });

  it('follows the clock for the newest year', () => {
    expect(
      resolveCatalogList(
        'seasonal',
        { season: 'WINTER', year: 2028 },
        new Date('2027-01-01T00:00:00Z'),
      ).outcome,
    ).toBe('ok');
  });

  it('refuses a season without a year and a year without a season', () => {
    expect(resolve('seasonal', { season: 'FALL' })).toEqual({
      outcome: 'invalid',
      details: [{ field: 'year', message: 'year is required with season' }],
    });
    expect(resolve('seasonal', { year: 2026 })).toEqual({
      outcome: 'invalid',
      details: [{ field: 'season', message: 'season is required with year' }],
    });
  });

  it('refuses season and year on any other kind, naming both', () => {
    expect(resolve('top', { season: 'FALL', year: 2026 })).toEqual({
      outcome: 'invalid',
      details: [
        {
          field: 'season',
          message: 'season applies to the seasonal list only',
        },
        { field: 'year', message: 'year applies to the seasonal list only' },
      ],
    });
  });
});

describe('isFresh', () => {
  const fetchedAt = new Date('2026-11-12T10:00:00Z');

  it('is fresh up to, not including, the lifetime', () => {
    expect(
      isFresh(
        'trending',
        fetchedAt,
        new Date(fetchedAt.getTime() + HOUR_MS - 1),
      ),
    ).toBe(true);
    expect(
      isFresh('trending', fetchedAt, new Date(fetchedAt.getTime() + HOUR_MS)),
    ).toBe(false);
    expect(
      isFresh('top', fetchedAt, new Date(fetchedAt.getTime() + 23 * HOUR_MS)),
    ).toBe(true);
    expect(
      isFresh(
        'seasonal',
        fetchedAt,
        new Date(fetchedAt.getTime() + 24 * HOUR_MS),
      ),
    ).toBe(false);
  });
});

describe('cursor', () => {
  it('round-trips every offset from 0 to 999', () => {
    for (const offset of [0, 1, 24, 50, 998, 999]) {
      expect(decodeCursor(encodeCursor(offset))).toBe(offset);
    }
  });

  it('is base64url of "v1:" and the offset', () => {
    expect(encodeCursor(24)).toBe(Buffer.from('v1:24').toString('base64url'));
  });

  it.each([
    ['not base64', '!!!'],
    ['empty', ''],
    ['wrong version', Buffer.from('v2:24').toString('base64url')],
    ['no offset', Buffer.from('v1:').toString('base64url')],
    ['negative', Buffer.from('v1:-1').toString('base64url')],
    ['fractional', Buffer.from('v1:1.5').toString('base64url')],
    ['padded', Buffer.from('v1:024').toString('base64url')],
    ['past the cap', encodeCursor(1_000)],
    ['hex', Buffer.from('v1:0x10').toString('base64url')],
  ])('rejects %s', (_name, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe('readWindow', () => {
  it('stays in one source page', () => {
    expect(readWindow(0, 24)).toEqual({ end: 24, firstPage: 1, lastPage: 1 });
    expect(readWindow(0, 50)).toEqual({ end: 50, firstPage: 1, lastPage: 1 });
  });

  it('spans two source pages across a boundary', () => {
    expect(readWindow(48, 24)).toEqual({ end: 72, firstPage: 1, lastPage: 2 });
    expect(readWindow(49, 50)).toEqual({ end: 99, firstPage: 1, lastPage: 2 });
  });

  it('starts on a page boundary', () => {
    expect(readWindow(50, 1)).toEqual({ end: 51, firstPage: 2, lastPage: 2 });
  });

  it('is cut at the 1000-entry cap', () => {
    expect(readWindow(999, 50)).toEqual({
      end: 1000,
      firstPage: 20,
      lastPage: 20,
    });
    expect(readWindow(980, 50)).toEqual({
      end: 1000,
      firstPage: 20,
      lastPage: 20,
    });
  });
});

describe('assembleWindow', () => {
  const T0 = new Date('2026-11-12T10:00:00Z');
  const block = (
    page: number,
    count: number,
    extra: Partial<WindowBlock<number>> = {},
  ): WindowBlock<number> => ({
    page,
    entries: Array.from({ length: count }, (_, i) => (page - 1) * 50 + i),
    hasNextPage: true,
    fetchedAt: T0,
    fresh: true,
    ...extra,
  });

  it('reads one block', () => {
    const window = assembleWindow([block(1, 50)], 0, 3);

    expect(window).toMatchObject({
      entries: [0, 1, 2],
      nextOffset: 3,
      freshness: 'fresh',
      fetchedAt: T0,
    });
  });

  it('joins two blocks, each against its own first position', () => {
    // Page 1 is short (an entry was dropped): page 2 still starts at position 50.
    const window = assembleWindow([block(1, 49), block(2, 50)], 48, 4);

    expect(window.entries).toEqual([48, 50, 51]);
    expect(window.nextOffset).toBe(52);
  });

  it('ends on a last block with nothing left', () => {
    const window = assembleWindow([block(1, 3, { hasNextPage: false })], 0, 24);

    expect(window).toMatchObject({ entries: [0, 1, 2], nextOffset: null });
  });

  it('continues when the last block has more than the window', () => {
    expect(
      assembleWindow([block(1, 30, { hasNextPage: false })], 0, 10).nextOffset,
    ).toBe(10);
  });

  it('is stale with the oldest fetchedAt when any block is stale', () => {
    const older = new Date(T0.getTime() - 1_000);
    const window = assembleWindow(
      [block(1, 50), block(2, 50, { fresh: false, fetchedAt: older })],
      40,
      20,
    );

    expect(window).toMatchObject({ freshness: 'stale', fetchedAt: older });
  });

  it('is empty and at the end without blocks', () => {
    expect(assembleWindow([], 500, 24)).toEqual({
      entries: [],
      nextOffset: null,
      freshness: 'fresh',
      fetchedAt: null,
    });
  });

  it('stops at the cap even when AniList has more', () => {
    const window = assembleWindow([block(20, 50)], 999, 50);

    expect(window).toMatchObject({ entries: [999], nextOffset: null });
  });
});
