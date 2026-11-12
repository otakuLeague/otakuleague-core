import {
  ANIME_FORMATS,
  ANIME_SEASONS,
  ANIME_STATUSES,
} from '@otakuleague/shared-types';
import type { AnimeListPage as AnimeListPageRow } from '../generated/prisma/client';
import {
  anilistId,
  anilistImageUrl,
  boundedText,
  boundedTexts,
  hexColor,
  integer,
  oneOf,
  partialDate,
  percentScore,
  record,
} from './sources/parse';
import type { ListBlock, ListedAnime } from './sources/source.types';

// anime_list_page rows (ADR 0016). `entries` is only ever written by toListRow, but a row
// that no longer validates (the entry shape changed) is a miss, so no data migration is needed.

/** A stored block and when it was fetched. */
export interface StoredListBlock extends ListBlock {
  readonly fetchedAt: Date;
}

/** Columns of one block. Entries are spread into plain objects: Prisma's JSON input rejects interfaces. */
export function toListRow(block: ListBlock, fetchedAt: Date) {
  return {
    fetchedAt,
    hasNextPage: block.hasNextPage,
    entries: block.entries.map((entry) => ({
      ...entry,
      startDate: entry.startDate && { ...entry.startDate },
      genres: [...entry.genres],
      score: entry.score && { ...entry.score },
    })),
  };
}

function readScore(value: unknown): ListedAnime['score'] | undefined {
  if (value === null) return null;
  const raw = record(value);
  const score = percentScore(raw.score);
  return raw.source === 'anilist' && raw.scale === 100 && score !== null
    ? { source: 'anilist', score, scale: 100 }
    : undefined;
}

function readEntry(value: unknown): ListedAnime | null {
  const raw = record(value);
  const id = anilistId(raw.anilistId);
  const score = readScore(raw.score);
  if (id === null || score === undefined) return null;
  return {
    anilistId: id,
    titleEnglish: boundedText(raw.titleEnglish),
    titleRomaji: boundedText(raw.titleRomaji),
    coverImageUrl: anilistImageUrl(raw.coverImageUrl),
    coverColor: hexColor(raw.coverColor),
    format: oneOf(raw.format, ANIME_FORMATS),
    status: oneOf(raw.status, ANIME_STATUSES),
    episodes: integer(raw.episodes, 1),
    season: oneOf(raw.season, ANIME_SEASONS),
    seasonYear: integer(raw.seasonYear, 1),
    startDate: partialDate(raw.startDate),
    genres: boundedTexts(raw.genres),
    members: integer(raw.members),
    score,
  };
}

/** Null (a miss) when any entry is invalid. */
export function fromListRow(row: AnimeListPageRow): StoredListBlock | null {
  if (!Array.isArray(row.entries)) return null;
  const entries = row.entries.map(readEntry);
  if (entries.some((entry) => entry === null)) return null;
  return {
    entries: entries.filter((entry) => entry !== null),
    hasNextPage: row.hasNextPage,
    fetchedAt: row.fetchedAt,
  };
}
