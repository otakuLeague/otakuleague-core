import type {
  AnimeListCard,
  AnimeListCardPage,
  AnimeListKind,
} from '@otakuleague/shared-types';
import type { ApiResult } from '../api/client';

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
/** Asked for per row: room for repeats dropped by the dedupe, still one small page. */
export const HOME_ROW_FETCH_LIMIT = 12;

export type HomeRowState =
  | { readonly kind: 'loaded'; readonly entries: readonly AnimeListCard[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed' };

/** The first page, deduplicated by AniList id (a page boundary can repeat one) and capped. */
export function toHomeRowState(
  result: ApiResult<AnimeListCardPage>,
): HomeRowState {
  if (!result.ok) {
    return { kind: 'failed' };
  }
  const seen = new Set<number>();
  const entries = result.data.entries
    .filter((entry) => {
      if (seen.has(entry.anilistId)) return false;
      seen.add(entry.anilistId);
      return true;
    })
    .slice(0, HOME_ROW_MAX_CARDS);
  return entries.length === 0 ? { kind: 'empty' } : { kind: 'loaded', entries };
}

export function cardHref(entry: Pick<AnimeListCard, 'anilistId' | 'slug'>): string {
  return entry.slug === null
    ? `/anime/anilist/${entry.anilistId}`
    : `/anime/${entry.slug}`;
}

/** Only an absolute https URL is rendered; anything else leaves the empty cover frame. */
export function coverSrc(entry: Pick<AnimeListCard, 'coverImageUrl'>): string | null {
  if (entry.coverImageUrl === null || !URL.canParse(entry.coverImageUrl)) {
    return null;
  }
  return new URL(entry.coverImageUrl).protocol === 'https:'
    ? entry.coverImageUrl
    : null;
}

function presentTitle(title: string | null): string | null {
  return title === null || title.trim() === '' ? null : title;
}

export function cardTitle(
  entry: Pick<AnimeListCard, 'titleEnglish' | 'titleRomaji'>,
): string {
  return (
    presentTitle(entry.titleEnglish) ??
    presentTitle(entry.titleRomaji) ??
    'Untitled'
  );
}
