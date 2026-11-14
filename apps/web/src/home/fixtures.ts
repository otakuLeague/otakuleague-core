import type {
  AnimeListCardPage,
  AnimeListEntry,
} from '@otakuleague/shared-types';
import type { ApiResult } from '../api/client';

export function listEntry(
  overrides: Partial<AnimeListEntry> = {},
): AnimeListEntry {
  return {
    anilistId: 154587,
    slug: 'frieren-beyond-journeys-end',
    imported: true,
    titleEnglish: "Frieren: Beyond Journey's End",
    titleRomaji: 'Sousou no Frieren',
    coverImageUrl:
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg',
    coverColor: '#3a7d6b',
    format: 'TV',
    status: 'FINISHED',
    episodes: 28,
    season: 'FALL',
    seasonYear: 2023,
    startDate: { year: 2023, month: 9, day: 29 },
    genres: ['Adventure', 'Drama', 'Fantasy'],
    members: 480_000,
    score: { source: 'anilist', score: 91, scale: 100 },
    ...overrides,
  };
}

/** `count` distinct entries, AniList ids 1..count. */
export function listEntries(count: number): readonly AnimeListEntry[] {
  return Array.from({ length: count }, (_, index) =>
    listEntry({ anilistId: index + 1, slug: `anime-${index + 1}` }),
  );
}

export function listResult(
  entries: readonly AnimeListEntry[],
): ApiResult<AnimeListCardPage> {
  return {
    ok: true,
    data: {
      kind: 'top',
      entries,
      nextCursor: null,
    },
  };
}
