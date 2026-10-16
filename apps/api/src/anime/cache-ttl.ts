import type { AnimeStatus } from '@otakuleague/shared-types';

/** Cache lifetimes for AniList data (ADR 0006), shared by the importer and the franchise walker. */

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Deleted when nobody used it for this long. */
export const PURGE_AFTER_MS = 30 * DAY_MS;

/** Airing and announced shows refresh daily, the rest after 7 days. */
export function refreshTtlMs(status: AnimeStatus | null | undefined): number {
  return status === 'RELEASING' || status === 'NOT_YET_RELEASED'
    ? DAY_MS
    : 7 * DAY_MS;
}
