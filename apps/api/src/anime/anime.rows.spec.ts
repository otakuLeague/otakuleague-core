import { describe, expect, it } from 'vitest';
import { type AnimeRow, fromAnimeRow, toSnapshotRow } from './anime.rows';
import { mapAniListMedia } from './sources/anilist.mapper';
import { fixture } from './sources/fixtures';
import { mapJikanAnime } from './sources/jikan.mapper';
import { record } from './sources/parse';

const FETCHED_AT = new Date('2026-11-12T10:00:00.000Z');

function rowWith(
  source: 'ANILIST' | 'JIKAN',
  images: { coverImageUrl: string; bannerImageUrl: string },
): AnimeRow {
  const mapped =
    source === 'ANILIST'
      ? mapAniListMedia(
          record(record(record(fixture('anilist-attack-on-titan')).data).Media),
        )
      : mapJikanAnime(record(record(fixture('jikan-frieren')).data));
  if (mapped === null) throw new Error('fixture');
  // The row type is the generated Prisma model; only these columns are read.
  return {
    id: 'anime-1',
    lastViewedAt: FETCHED_AT,
    externalIds: [],
    snapshots: [
      {
        source,
        ...toSnapshotRow(mapped, FETCHED_AT),
        ...images,
      },
    ],
  } as unknown as AnimeRow;
}

describe('fromAnimeRow images', () => {
  it('keeps stored images on the supplying source host', () => {
    const [snapshot] = fromAnimeRow(
      rowWith('ANILIST', {
        coverImageUrl: 'https://s4.anilist.co/cover.jpg',
        bannerImageUrl: 'https://s4.anilist.co/banner.jpg',
      }),
    ).snapshots;

    expect(snapshot?.snapshot.coverImageUrl).toBe(
      'https://s4.anilist.co/cover.jpg',
    );
    expect(snapshot?.snapshot.bannerImageUrl).toBe(
      'https://s4.anilist.co/banner.jpg',
    );
  });

  it('turns a stored foreign, http or non-canonical image into null', () => {
    const [snapshot] = fromAnimeRow(
      rowWith('ANILIST', {
        coverImageUrl: 'http://s4.anilist.co/cover.jpg',
        bannerImageUrl: 'https://evil.example/banner.jpg',
      }),
    ).snapshots;

    expect(snapshot?.snapshot.coverImageUrl).toBeNull();
    expect(snapshot?.snapshot.bannerImageUrl).toBeNull();
  });

  it('checks a Jikan row against MyAnimeList, not AniList', () => {
    const [snapshot] = fromAnimeRow(
      rowWith('JIKAN', {
        coverImageUrl: 'https://cdn.myanimelist.net/images/a.jpg',
        bannerImageUrl: 'https://s4.anilist.co/banner.jpg',
      }),
    ).snapshots;

    expect(snapshot?.snapshot.coverImageUrl).toBe(
      'https://cdn.myanimelist.net/images/a.jpg',
    );
    expect(snapshot?.snapshot.bannerImageUrl).toBeNull();
  });
});
