import type { AnimeDataSource } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import {
  mergeAnime,
  type StoredAnime,
  type StoredSnapshot,
} from './anime.merge';
import { mapAniListMedia } from './sources/anilist.mapper';
import { fixture } from './sources/fixtures';
import { mapJikanAnime } from './sources/jikan.mapper';
import { record } from './sources/parse';
import type { AnimeSnapshot } from './sources/source.types';

const ANILIST_AT = new Date('2026-10-15T10:00:00.000Z');
const JIKAN_AT = new Date('2026-10-15T10:05:00.000Z');
const NOW = new Date('2026-10-15T12:00:00.000Z');

function aniListSnapshot(): AnimeSnapshot {
  const snapshot = mapAniListMedia(
    record(record(fixture('anilist-attack-on-titan')).data).Media,
  );
  if (snapshot === null) throw new Error('fixture did not map');
  return snapshot;
}

function jikanSnapshot(): AnimeSnapshot {
  const snapshot = mapJikanAnime(record(fixture('jikan-attack-on-titan')).data);
  if (snapshot === null) throw new Error('fixture did not map');
  return snapshot;
}

function stored(
  source: AnimeDataSource,
  fetchedAt: Date,
  snapshot: AnimeSnapshot,
): StoredSnapshot {
  // ids and adult are import-time only; the stored shape just ignores them.
  return { source, fetchedAt, snapshot };
}

const anilist = stored('anilist', ANILIST_AT, aniListSnapshot());
const jikan = stored('jikan', JIKAN_AT, jikanSnapshot());

function anime(...snapshots: StoredSnapshot[]): StoredAnime {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    lastViewedAt: NOW,
    externalIds: [
      { source: 'myanimelist', externalId: 16498 },
      { source: 'anilist', externalId: 16498 },
    ],
    snapshots,
  };
}

const allEnabled = (): boolean => true;

describe('mergeAnime', () => {
  it('takes each field from AniList first, whatever the storage order', () => {
    const merged = mergeAnime(anime(jikan, anilist), allEnabled, NOW);

    expect(merged.titleEnglish).toEqual({
      value: 'Attack on Titan',
      source: 'anilist',
      fetchedAt: ANILIST_AT.toISOString(),
    });
    expect(merged.studios?.source).toBe('anilist');
    expect(merged.externalIds).toEqual([
      { source: 'anilist', id: '16498' },
      { source: 'myanimelist', id: '16498' },
    ]);
  });

  it('fills a field AniList lacks from Jikan, with Jikan as its source', () => {
    const partial = stored('anilist', ANILIST_AT, {
      ...aniListSnapshot(),
      endDate: null,
      genres: [],
    });

    const merged = mergeAnime(anime(partial, jikan), allEnabled, NOW);

    expect(merged.endDate).toEqual({
      value: { year: 2013, month: 9, day: 29 },
      source: 'jikan',
      fetchedAt: JIKAN_AT.toISOString(),
    });
    // An empty list counts as missing, so Jikan's genres fill in.
    expect(merged.genres?.source).toBe('jikan');
  });

  it('lists the scores side by side, never averaged', () => {
    expect(mergeAnime(anime(anilist, jikan), allEnabled, NOW).scores).toEqual([
      {
        source: 'anilist',
        fetchedAt: ANILIST_AT.toISOString(),
        score: 85,
        scale: 100,
        scoredBy: null,
        rank: null,
        members: anilist.snapshot.members,
      },
      {
        source: 'jikan',
        fetchedAt: JIKAN_AT.toISOString(),
        score: 8.57,
        scale: 10,
        scoredBy: 3010972,
        rank: 117,
        members: 4275990,
      },
    ]);
  });

  it('hides everything from a switched-off source: fields, scores and attribution', () => {
    const merged = mergeAnime(
      anime(anilist, jikan),
      (source) => source !== 'jikan',
      NOW,
    );

    expect(JSON.stringify(merged)).not.toContain('"jikan"');
    expect(merged.scores.map((score) => score.source)).toEqual(['anilist']);
  });

  it('serves Jikan values alone when AniList is switched off', () => {
    const merged = mergeAnime(
      anime(anilist, jikan),
      (source) => source !== 'anilist',
      NOW,
    );

    expect(merged.titleEnglish?.source).toBe('jikan');
    expect(merged.bannerImageUrl).toBeNull();
    expect(merged.attributions).toEqual([
      {
        source: 'jikan',
        url: 'https://myanimelist.net/anime/16498/Shingeki_no_Kyojin',
        fetchedAt: JIKAN_AT.toISOString(),
      },
    ]);
  });

  it('returns null fields and no scores when no enabled source has data', () => {
    const merged = mergeAnime(anime(anilist), () => false, NOW);

    expect(merged.titleRomaji).toBeNull();
    expect(merged.scores).toEqual([]);
    expect(merged.attributions).toEqual([]);
  });
  it('hides the ids only a switched-off source vouches for', () => {
    const noAniList = mergeAnime(
      anime(anilist, jikan),
      (source) => source !== 'anilist',
      NOW,
    );
    const noJikan = mergeAnime(
      anime(anilist, jikan),
      (source) => source !== 'jikan',
      NOW,
    );

    expect(noAniList.externalIds).toEqual([
      { source: 'myanimelist', id: '16498' },
    ]);
    // AniList also reports the MAL id, so it stays visible with Jikan off.
    expect(noJikan.externalIds).toEqual([
      { source: 'anilist', id: '16498' },
      { source: 'myanimelist', id: '16498' },
    ]);
  });

  it('drops a next episode that has already aired', () => {
    const airing = stored('anilist', ANILIST_AT, {
      ...aniListSnapshot(),
      nextEpisode: {
        episode: 12,
        airingAt: new Date('2026-10-15T11:00:00.000Z'),
      },
    });

    expect(mergeAnime(anime(airing), allEnabled, NOW).nextEpisode).toBeNull();
    expect(
      mergeAnime(
        anime(airing),
        allEnabled,
        new Date('2026-10-15T10:59:00.000Z'),
      ).nextEpisode?.value,
    ).toEqual({ episode: 12, airingAt: '2026-10-15T11:00:00.000Z' });
  });
});
