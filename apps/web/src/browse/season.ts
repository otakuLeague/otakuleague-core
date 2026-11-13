import {
  ANIME_LIST_MIN_YEAR,
  ANIME_SEASONS,
  type AnimeListSeason,
  type AnimeSeason,
} from '@otakuleague/shared-types';
import { GRID_MAX_PAGE } from './anime-grid';

/** What `/season` shows: a season and how many grid pages of it. */
export interface SeasonRequest {
  readonly season: AnimeListSeason;
  readonly page: number;
}

export type SearchParamsRecord = Readonly<
  Record<string, string | string[] | undefined>
>;

/** UTC calendar quarters, the API's rule: Jan-Mar winter, Apr-Jun spring, Jul-Sep summer, Oct-Dec fall. */
export function currentSeason(now: Date): AnimeListSeason {
  const season = ANIME_SEASONS[Math.floor(now.getUTCMonth() / 3)] ?? 'FALL';
  return { season, year: now.getUTCFullYear() };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseSeason(value: string | undefined): AnimeSeason | null {
  const upper = value?.toUpperCase();
  return ANIME_SEASONS.find((season) => season === upper) ?? null;
}

/** Plain decimal digits only: "2026.0" or "0x7EA" are not years. */
function parseYear(value: string | undefined, now: Date): number | null {
  if (value === undefined || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= ANIME_LIST_MIN_YEAR && year <= now.getUTCFullYear() + 1
    ? year
    : null;
}

function parsePage(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), GRID_MAX_PAGE);
}

/**
 * The season in the URL, or the current one when season or year is missing or invalid: a bad
 * link still shows a useful page (no 404, no redirect). Old-site params (sort, q, formats) are ignored.
 */
export function parseSeasonRequest(
  searchParams: SearchParamsRecord,
  now: Date,
): SeasonRequest {
  const season = parseSeason(firstValue(searchParams.season));
  const year = parseYear(firstValue(searchParams.year), now);
  return {
    season:
      season === null || year === null ? currentSeason(now) : { season, year },
    page: parsePage(firstValue(searchParams.page)),
  };
}

/** One season earlier (-1) or later (1); null outside Winter 1917..Fall of next year. */
export function stepSeason(
  from: AnimeListSeason,
  direction: -1 | 1,
  now: Date,
): AnimeListSeason | null {
  const index = from.year * 4 + ANIME_SEASONS.indexOf(from.season) + direction;
  const year = Math.floor(index / 4);
  const season = ANIME_SEASONS[index % 4];
  if (
    season === undefined ||
    year < ANIME_LIST_MIN_YEAR ||
    year > now.getUTCFullYear() + 1
  ) {
    return null;
  }
  return { season, year };
}

export function seasonHref(season: AnimeListSeason, page = 1): string {
  const query = `season=${season.season.toLowerCase()}&year=${season.year}`;
  return page > 1 ? `/season?${query}&page=${page}` : `/season?${query}`;
}

export function seasonLabel(season: AnimeListSeason): string {
  const name = season.season.charAt(0) + season.season.slice(1).toLowerCase();
  return `${name} ${season.year}`;
}

export function isSameSeason(a: AnimeListSeason, b: AnimeListSeason): boolean {
  return a.season === b.season && a.year === b.year;
}
