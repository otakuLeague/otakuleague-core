import type {
  AnimeGenre,
  AnimeListKind,
  AnimeListSeason,
  AnimeSeason,
} from '@otakuleague/shared-types';
import type { ListQuery } from './sources/anilist.adapter';
import { LIST_PAGE_SIZE } from './sources/anilist.query';

export { LIST_PAGE_SIZE };

// Catalog lists (ADR 0016): what each kind asks AniList for, how long a stored page lives,
// and the cursor arithmetic. Pure, so the service stays about I/O.

const HOUR_MS = 60 * 60 * 1000;

/** A list is read at most this deep (20 source pages). */
export const LIST_MAX_DEPTH = 1_000;

interface ListSpec {
  readonly query: ListQuery;
  readonly ttlMs: number;
}

const LISTS: Readonly<Record<AnimeListKind, ListSpec>> = {
  trending: {
    query: { sort: ['TRENDING_DESC', 'POPULARITY_DESC'] },
    ttlMs: HOUR_MS,
  },
  airing: {
    query: { sort: ['POPULARITY_DESC'], status: 'RELEASING' },
    ttlMs: 6 * HOUR_MS,
  },
  upcoming: {
    query: { sort: ['POPULARITY_DESC'], status: 'NOT_YET_RELEASED' },
    ttlMs: 24 * HOUR_MS,
  },
  top: {
    query: { sort: ['SCORE_DESC', 'POPULARITY_DESC'] },
    ttlMs: 24 * HOUR_MS,
  },
  seasonal: {
    query: { sort: ['POPULARITY_DESC'] },
    ttlMs: 24 * HOUR_MS,
  },
};

/** A list as asked for, defaults applied: what the cache key and the AniList query come from. */
export interface CatalogList {
  readonly kind: AnimeListKind;
  /** Set for `seasonal` only. */
  readonly season: AnimeListSeason | null;
  readonly genre: AnimeGenre | null;
}

/** The request's filters as received (each already checked alone by the controller). */
export interface ListFilters {
  readonly season?: AnimeSeason;
  readonly year?: number;
  readonly genre?: AnimeGenre;
}

export interface ListFilterIssue {
  readonly field: 'season' | 'year';
  readonly message: string;
}

export type CatalogListResolution =
  | { readonly outcome: 'ok'; readonly list: CatalogList }
  | { readonly outcome: 'invalid'; readonly details: ListFilterIssue[] };

function seasonOfMonth(monthIndex: number): AnimeSeason {
  if (monthIndex < 3) return 'WINTER';
  if (monthIndex < 6) return 'SPRING';
  if (monthIndex < 9) return 'SUMMER';
  return 'FALL';
}

/** UTC calendar quarters: Jan-Mar winter, Apr-Jun spring, Jul-Sep summer, Oct-Dec fall. */
export function currentSeason(now: Date): AnimeListSeason {
  return {
    season: seasonOfMonth(now.getUTCMonth()),
    year: now.getUTCFullYear(),
  };
}

/**
 * The rules that need more than one field or the clock (ADR 0016 addendum): season and year
 * come together and only with `seasonal`; the year is at most next year (UTC); `seasonal`
 * with neither is the current season. Every violation is reported, not just the first.
 */
export function resolveCatalogList(
  kind: AnimeListKind,
  { season, year, genre }: ListFilters,
  now: Date,
): CatalogListResolution {
  const details: ListFilterIssue[] = [];
  if (kind !== 'seasonal') {
    if (season !== undefined) {
      details.push({
        field: 'season',
        message: 'season applies to the seasonal list only',
      });
    }
    if (year !== undefined) {
      details.push({
        field: 'year',
        message: 'year applies to the seasonal list only',
      });
    }
  } else if (season !== undefined && year === undefined) {
    details.push({ field: 'year', message: 'year is required with season' });
  } else if (season === undefined && year !== undefined) {
    details.push({ field: 'season', message: 'season is required with year' });
  } else if (year !== undefined && year > now.getUTCFullYear() + 1) {
    details.push({
      field: 'year',
      message: `year must be at most ${now.getUTCFullYear() + 1}`,
    });
  }
  if (details.length > 0) return { outcome: 'invalid', details };
  return {
    outcome: 'ok',
    list: {
      kind,
      season:
        kind !== 'seasonal'
          ? null
          : season !== undefined && year !== undefined
            ? { season, year }
            : currentSeason(now),
      genre: genre ?? null,
    },
  };
}

/**
 * The cache key: the kind, then `|season=FALL|year=2026`, then `|genre=Drama`, each part only
 * when set. The values come from closed sets without `|`, `=` or `#`.
 */
export function listKey({ kind, season, genre }: CatalogList): string {
  return [
    kind,
    ...(season === null
      ? []
      : [`season=${season.season}`, `year=${season.year}`]),
    ...(genre === null ? [] : [`genre=${genre}`]),
  ].join('|');
}

/** What AniList is asked: the kind's fixed part plus the season and genre that are set. */
export function listQuery({ kind, season, genre }: CatalogList): ListQuery {
  return {
    ...LISTS[kind].query,
    ...(season === null
      ? {}
      : { season: season.season, seasonYear: season.year }),
    ...(genre === null ? {} : { genre }),
  };
}

export function isFresh(kind: AnimeListKind, fetchedAt: Date, now: Date) {
  return now.getTime() - fetchedAt.getTime() < LISTS[kind].ttlMs;
}

const CURSOR_PREFIX = 'v1:';

/** Opaque to clients: base64url of "v1:" and the position in the list. */
export function encodeCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${offset}`).toString('base64url');
}

/** The position, or null for anything encodeCursor could not have produced. */
export function decodeCursor(cursor: string): number | null {
  const decoded = Buffer.from(cursor, 'base64url').toString();
  if (!decoded.startsWith(CURSOR_PREFIX)) return null;
  const offset = Number(decoded.slice(CURSOR_PREFIX.length));
  return Number.isInteger(offset) &&
    offset >= 0 &&
    offset < LIST_MAX_DEPTH &&
    encodeCursor(offset) === cursor
    ? offset
    : null;
}

/** Positions `offset` to `end - 1` live in source pages firstPage..lastPage (1-based, at most 2). */
export function readWindow(offset: number, limit: number) {
  const end = Math.min(offset + limit, LIST_MAX_DEPTH);
  return {
    end,
    firstPage: Math.floor(offset / LIST_PAGE_SIZE) + 1,
    lastPage: Math.floor((end - 1) / LIST_PAGE_SIZE) + 1,
  };
}

/** A stored source page as `assembleWindow` reads it. */
export interface WindowBlock<Entry> {
  /** AniList's page number, from 1. */
  readonly page: number;
  readonly entries: readonly Entry[];
  readonly hasNextPage: boolean;
  readonly fetchedAt: Date;
  readonly fresh: boolean;
}

/**
 * The entries at positions `offset` to `offset + limit - 1` (capped at LIST_MAX_DEPTH) from
 * the blocks that hold them, each read against its own first position. `nextOffset` is null
 * at the end: the cap, or a last block with nothing left. Stale when any block is; fetchedAt
 * is the oldest block's (null without blocks).
 */
export function assembleWindow<Entry>(
  blocks: readonly WindowBlock<Entry>[],
  offset: number,
  limit: number,
) {
  const end = Math.min(offset + limit, LIST_MAX_DEPTH);
  const entries = blocks.flatMap(({ page, entries: block }) => {
    const base = (page - 1) * LIST_PAGE_SIZE;
    return block.slice(Math.max(offset - base, 0), Math.max(end - base, 0));
  });
  const last = blocks.at(-1);
  const hasMore =
    last !== undefined &&
    (last.entries.length > end - (last.page - 1) * LIST_PAGE_SIZE ||
      last.hasNextPage);
  return {
    entries,
    nextOffset: end < LIST_MAX_DEPTH && hasMore ? end : null,
    freshness: blocks.every(({ fresh }) => fresh)
      ? ('fresh' as const)
      : ('stale' as const),
    fetchedAt:
      blocks.length === 0
        ? null
        : new Date(
            Math.min(...blocks.map(({ fetchedAt }) => fetchedAt.getTime())),
          ),
  };
}
