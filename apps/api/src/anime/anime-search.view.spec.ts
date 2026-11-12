import { describe, expect, it } from 'vitest';
import { mergeAnime, type StoredAnime } from './anime.merge';
import { toSearchHit } from './anime-search.view';
import { mapAniListMedia } from './sources/anilist.mapper';
import { fixture } from './sources/fixtures';
import { mapJikanAnime } from './sources/jikan.mapper';
import { record } from './sources/parse';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const FETCHED_AT = new Date('2026-10-15T10:00:00.000Z');
const MATCHED = { kind: 'synonym', title: 'AoT' } as const;

function stored(
  sources: readonly ('anilist' | 'jikan')[],
  ids: StoredAnime['externalIds'],
): StoredAnime {
  const anilist = mapAniListMedia(
    record(record(fixture('anilist-attack-on-titan')).data).Media,
  );
  const jikan = mapJikanAnime(record(fixture('jikan-attack-on-titan')).data);
  if (anilist === null || jikan === null)
    throw new Error('fixture did not map');
  return {
    id: 'anime-1',
    lastViewedAt: NOW,
    externalIds: ids,
    snapshots: sources.map((source) => ({
      source,
      fetchedAt: FETCHED_AT,
      snapshot: source === 'anilist' ? anilist : jikan,
    })),
  };
}

const hitOf = (
  anime: StoredAnime,
  enabled: readonly string[],
  slug: string | null,
) =>
  toSearchHit(
    mergeAnime(anime, (source) => enabled.includes(source), NOW),
    slug,
    MATCHED,
  );

describe('toSearchHit', () => {
  const both = stored(
    ['anilist', 'jikan'],
    [
      { source: 'anilist', externalId: 16498 },
      { source: 'myanimelist', externalId: 16498 },
    ],
  );

  it('builds a card from the merged anime and names the matched title', () => {
    const hit = hitOf(both, ['anilist', 'jikan'], 'attack-on-titan');

    expect(hit).toMatchObject({
      slug: 'attack-on-titan',
      ref: { source: 'anilist', id: '16498' },
      title: 'Attack on Titan',
      matchedTitle: { kind: 'synonym', text: 'AoT' },
      format: 'TV',
      score: { source: 'anilist', scale: 100 },
    });
    expect(hit?.startYear).toBe(2013);
  });

  it('has a null slug when the anime has no identity', () => {
    expect(hitOf(both, ['anilist', 'jikan'], null)?.slug).toBeNull();
  });

  it('refers to the MyAnimeList id when AniList is switched off', () => {
    const hit = hitOf(both, ['jikan'], null);

    expect(hit?.ref).toEqual({ source: 'myanimelist', id: '16498' });
    expect(hit?.score?.source).toBe('jikan');
  });

  it('is null when no visible source names an id', () => {
    expect(hitOf(stored(['anilist'], []), ['anilist'], null)).toBeNull();
  });

  it('falls back to the matched title when the anime has no title', () => {
    const anime = stored(['anilist'], [{ source: 'anilist', externalId: 1 }]);
    const [only] = anime.snapshots;
    const untitled: StoredAnime = {
      ...anime,
      snapshots: [
        {
          ...only!,
          snapshot: {
            ...only!.snapshot,
            titleEnglish: null,
            titleRomaji: null,
            titleNative: null,
          },
        },
      ],
    };

    expect(hitOf(untitled, ['anilist'], null)?.title).toBe('AoT');
  });
});
