import {
  ANIME_LIST_MAX_LIMIT,
  type AnimeListCard,
  type AnimeListCardPage,
} from '@otakuleague/shared-types';
import type { ApiFailure, ApiResult } from '../api/client';

/** Cards per "Show more" step. */
export const GRID_PAGE_SIZE = 24;
/** Deepest page a URL can ask for: 240 cards, five API calls at most. */
export const GRID_MAX_PAGE = 10;
/** Asked per API call: two grid pages, within the API's max. */
export const GRID_FETCH_LIMIT = Math.min(
  2 * GRID_PAGE_SIZE,
  ANIME_LIST_MAX_LIMIT,
);

export type GridMore = 'available' | 'end' | 'capped' | 'failed';

export type AnimeGridState =
  | {
      readonly kind: 'loaded';
      readonly entries: readonly AnimeListCard[];
      readonly more: GridMore;
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly reason: 'busy' | 'unavailable' };

export type LoadGridPage = (request: {
  readonly cursor: string | null;
  readonly limit: number;
}) => Promise<ApiResult<AnimeListCardPage>>;

function failureReason(failure: ApiFailure): 'busy' | 'unavailable' {
  return failure.kind === 'api_error' && failure.status === 429
    ? 'busy'
    : 'unavailable';
}

function dedupe(entries: readonly AnimeListCard[]): readonly AnimeListCard[] {
  const seen = new Set<number>();
  return entries.filter((entry) => {
    if (seen.has(entry.anilistId)) return false;
    seen.add(entry.anilistId);
    return true;
  });
}

/**
 * The first `pages` grid pages (clamped to 1..GRID_MAX_PAGE), walking the API's cursors: it has no
 * page parameter. Stops at the first failure: a failed first call fails the grid, a later one keeps
 * the cards already loaded. Full pages need ceil(pages / 2) calls; one spare call absorbs a short
 * page, and past that the walk stops with `available`, so short pages cannot loop forever.
 */
export async function collectGridPages(
  loadPage: LoadGridPage,
  requestedPages: number,
): Promise<AnimeGridState> {
  const pages = Number.isFinite(requestedPages)
    ? Math.min(Math.max(1, Math.trunc(requestedPages)), GRID_MAX_PAGE)
    : 1;
  const target = pages * GRID_PAGE_SIZE;
  const maxCalls = Math.ceil(pages / 2) + 1;
  const collected: AnimeListCard[] = [];
  let cursor: string | null = null;
  for (let call = 0; call < maxCalls && collected.length < target; call += 1) {
    const limit = Math.min(GRID_FETCH_LIMIT, target - collected.length);
    const result = await loadPage({ cursor, limit });
    if (!result.ok) {
      if (collected.length === 0) {
        return { kind: 'failed', reason: failureReason(result.failure) };
      }
      return { kind: 'loaded', entries: dedupe(collected), more: 'failed' };
    }
    collected.push(...result.data.entries);
    cursor = result.data.nextCursor;
    if (cursor === null) break;
  }
  const entries = dedupe(collected);
  if (entries.length === 0) return { kind: 'empty' };
  const more: GridMore =
    cursor === null ? 'end' : pages >= GRID_MAX_PAGE ? 'capped' : 'available';
  return { kind: 'loaded', entries, more };
}
