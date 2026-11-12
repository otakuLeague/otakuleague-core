import type { AnimeListKind } from '@otakuleague/shared-types';
import type { ListQuery } from './sources/anilist.adapter';

// Catalog lists (ADR 0016): what each kind asks AniList for, how long a stored page lives,
// and the cursor arithmetic. Pure, so the service stays about I/O.

const HOUR_MS = 60 * 60 * 1000;

/** Entries per stored page: AniList's `perPage` maximum. */
export const LIST_PAGE_SIZE = 50;
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
};

export function listSpec(kind: AnimeListKind): ListSpec {
  return LISTS[kind];
}

/** The cache key of a list; later filters (season, genre) become more parts. */
export function listKey(kind: AnimeListKind): string {
  return kind;
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
