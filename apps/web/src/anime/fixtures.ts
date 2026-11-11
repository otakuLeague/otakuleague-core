import type {
  AnimeDetails,
  AnimeFranchise,
  FranchiseSeason,
} from '@otakuleague/shared-types';

/** Test data only: Attack on Titan as the API serves it, every header field set. */
const sourced = <T>(value: T) => ({
  value,
  source: 'anilist' as const,
  fetchedAt: '2026-10-24T00:00:00.000Z',
});

export function animeFixture(
  overrides: Partial<AnimeDetails> = {},
): AnimeDetails {
  return {
    id: 'anime-1',
    canonicalSlug: 'attack-on-titan',
    externalIds: [{ source: 'anilist', id: '16498' }],
    titleRomaji: sourced('Shingeki no Kyojin'),
    titleEnglish: sourced('Attack on Titan'),
    titleNative: sourced('進撃の巨人'),
    synonyms: null,
    format: sourced('TV'),
    status: sourced('FINISHED'),
    startDate: sourced({ year: 2013, month: 4, day: 7 }),
    endDate: sourced({ year: 2013, month: 9, day: 29 }),
    season: sourced('SPRING'),
    seasonYear: sourced(2013),
    episodes: sourced(25),
    durationMinutes: sourced(24),
    synopsis: sourced('Humanity lives behind walls.'),
    coverImageUrl: sourced(
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg',
    ),
    bannerImageUrl: sourced(
      'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498.jpg',
    ),
    trailer: null,
    genres: sourced(['Action', 'Drama']),
    tags: null,
    studios: sourced([
      { name: 'Wit Studio', main: true },
      { name: 'Pony Canyon', main: false },
    ]),
    links: null,
    nextEpisode: null,
    creators: sourced(['Hajime Isayama']),
    favourites: sourced(110_432),
    rankRated: sourced(69),
    rankPopular: sourced(1),
    coverColor: sourced('#e4a15d'),
    scores: [
      {
        source: 'anilist',
        fetchedAt: '2026-10-24T00:00:00.000Z',
        score: 85,
        scale: 100,
        scoredBy: null,
        rank: null,
        members: 812_345,
      },
    ],
    attributions: [],
    ...overrides,
  };
}

export { sourced };

/** A main-line season: Attack on Titan's first, unless overridden. */
export function franchiseSeason(
  overrides: Partial<FranchiseSeason>,
): FranchiseSeason {
  return {
    anilistId: 16498,
    mediaType: 'ANIME',
    slug: 'attack-on-titan',
    title: 'Attack on Titan',
    format: 'TV',
    status: 'FINISHED',
    startDate: { year: 2013, month: 4, day: 7 },
    coverImageUrl: null,
    label: 'Season 1',
    isCurrent: true,
    ...overrides,
  };
}

export function franchiseFixture(
  mainLine: readonly FranchiseSeason[],
  state: AnimeFranchise['state'] = 'complete',
): AnimeFranchise {
  return { state, mainLine, related: [] };
}
