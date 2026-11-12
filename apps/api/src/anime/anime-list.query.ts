import type { AnimeListKind } from '@otakuleague/shared-types';
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
