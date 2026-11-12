import { describe, expect, it } from 'vitest';
import { fromListRow, toListRow } from './anime-list.rows';
import type { ListedAnime } from './sources/source.types';

const entry: ListedAnime = {
  anilistId: 900001,
  titleEnglish: 'Synthetic Magic Academy',
  titleRomaji: 'Synthetic Mahou Gakuen',
  coverImageUrl: 'https://s4.anilist.co/cover.jpg',
  coverColor: '#e4a15d',
  format: 'TV',
  status: 'RELEASING',
  episodes: 12,
  season: 'FALL',
  seasonYear: 2026,
  startDate: { year: 2026, month: 10, day: null },
  genres: ['Action'],
  members: 5,
  score: { source: 'anilist', score: 81, scale: 100 },
};
const fetchedAt = new Date('2026-11-12T10:00:00Z');

const stored = (entries: unknown) =>
  // The row type is the generated Prisma model; only these columns are read.
  ({
    listKey: 'airing',
    page: 1,
    fetchedAt,
    hasNextPage: true,
    entries,
  }) as never;

describe('anime_list_page rows', () => {
  it('round-trips entries through JSON', () => {
    const row = toListRow({ entries: [entry], hasNextPage: true }, fetchedAt);

    expect(
      fromListRow(stored(JSON.parse(JSON.stringify(row.entries)))),
    ).toEqual({
      entries: [entry],
      hasNextPage: true,
      fetchedAt,
    });
  });

  it('round-trips an empty page and an unrated entry', () => {
    const unrated = { ...entry, score: null, startDate: null };

    expect(fromListRow(stored([]))?.entries).toEqual([]);
    expect(fromListRow(stored([unrated]))?.entries).toEqual([unrated]);
  });

  it('is a miss when any entry no longer validates', () => {
    expect(fromListRow(stored([entry, { anilistId: 'x' }]))).toBeNull();
    expect(fromListRow(stored([{ ...entry, score: { score: 1 } }]))).toBeNull();
  });

  it('is a miss when entries is not an array', () => {
    expect(fromListRow(stored({ not: 'a list' }))).toBeNull();
    expect(fromListRow(stored(null))).toBeNull();
  });

  it('reads an off-site cover, a bad colour or an out-of-range score as absent or a miss', () => {
    const read = fromListRow(
      stored([
        {
          ...entry,
          coverImageUrl: 'https://evil.test/c.jpg',
          coverColor: 'red',
        },
      ]),
    );

    expect(read?.entries[0]).toMatchObject({
      coverImageUrl: null,
      coverColor: null,
    });
    expect(
      fromListRow(
        stored([{ ...entry, score: { ...entry.score, score: 500 } }]),
      ),
    ).toBeNull();
  });
});
