import type {
  AnimeListEntry,
  AnimeListKind,
  AnimeListPage,
} from '@otakuleague/shared-types';
import type { ApiFailure, ApiResult } from '../api/client';

/** One catalog row of the home page: which list it shows and where its "see all" link goes. */
export interface HomeRowDefinition {
  readonly id: string;
  readonly kind: AnimeListKind;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly linkLabel: string;
}

export const HOME_ROWS: readonly HomeRowDefinition[] = [
  {
    id: 'trending',
    kind: 'airing',
    title: 'Trending now',
    subtitle: 'Popular shows airing now',
    href: '/discover/airing',
    linkLabel: 'See all',
  },
  {
    id: 'season',
    kind: 'seasonal',
    title: 'This season',
    subtitle: 'Airing now, most popular first',
    href: '/season',
    linkLabel: 'Full season',
  },
  {
    id: 'top',
    kind: 'top',
    title: 'Top rated',
    subtitle: 'Highest scores of all time',
    href: '/top/anime',
    linkLabel: 'Rankings',
  },
];

/** Cards per row: two screens of a 1280 px column, the rest is behind "see all". */
export const HOME_ROW_MAX_CARDS = 8;

export type HomeRowState =
  | { readonly kind: 'loaded'; readonly entries: readonly AnimeListEntry[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

/** The first page, deduplicated by AniList id (a page boundary can repeat one) and capped. */
export function toHomeRowState(result: ApiResult<AnimeListPage>): HomeRowState {
  if (!result.ok) {
    return { kind: 'failed', failure: result.failure };
  }
  const entries = result.data.entries
    .filter(
      (entry, index, all) =>
        all.findIndex((other) => other.anilistId === entry.anilistId) ===
        index,
    )
    .slice(0, HOME_ROW_MAX_CARDS);
  return entries.length === 0 ? { kind: 'empty' } : { kind: 'loaded', entries };
}

export interface CardLink {
  readonly href: string;
  /** Set when the link imports the anime on a first visit: crawlers must not follow it (OTA-173). */
  readonly rel: 'nofollow' | undefined;
}

export function cardLink(
  entry: Pick<AnimeListEntry, 'anilistId' | 'slug'>,
): CardLink {
  return entry.slug === null
    ? { href: `/anime/anilist/${entry.anilistId}`, rel: 'nofollow' }
    : { href: `/anime/${encodeURIComponent(entry.slug)}`, rel: undefined };
}

export function cardTitle(
  entry: Pick<AnimeListEntry, 'titleEnglish' | 'titleRomaji'>,
): string {
  return entry.titleEnglish ?? entry.titleRomaji ?? 'Untitled';
}
