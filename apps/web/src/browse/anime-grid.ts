import type {
  AnimeListCard,
  AnimeListCardPage,
} from '@otakuleague/shared-types';
import type { ApiFailure, ApiResult } from '../api/client';

/** Cards per "Show more" step. */
export const GRID_PAGE_SIZE = 24;
/** Deepest page a URL can ask for: 240 cards, five API calls at most. */
export const GRID_MAX_PAGE = 10;
/** Asked per API call: two grid pages, under the API's max of 50. */
const GRID_FETCH_LIMIT = 48;

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
 * The first `pages` grid pages, walking the API's cursors (it has no page parameter). Stops at the
 * first failure: a failed first call fails the grid, a later one keeps the cards already loaded.
 * At most one call per page, so short pages with a cursor cannot loop forever.
 */
export async function collectGridPages(
  loadPage: LoadGridPage,
  pages: number,
): Promise<AnimeGridState> {
  const target = pages * GRID_PAGE_SIZE;
  const collected: AnimeListCard[] = [];
  let cursor: string | null = null;
  for (let call = 0; call < pages && collected.length < target; call += 1) {
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
