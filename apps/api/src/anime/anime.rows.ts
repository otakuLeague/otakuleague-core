import type {
  AnimeDataSource,
  AnimeIdSource,
  AnimeLink,
  AnimeStudio,
  AnimeTag,
  AnimeTrailer,
  PartialDate,
} from '@otakuleague/shared-types';
import type {
  AnimeDataSource as DbDataSource,
  AnimeIdSource as DbIdSource,
  Prisma,
} from '../generated/prisma/client';
import type { StoredAnime, StoredSnapshot } from './anime.merge';
import { integer, oneOf, record, text } from './sources/parse';
import type { AnimeSnapshot } from './sources/source.types';

// Conversions between our model and the database rows. The JSON columns are only ever
// written by toSnapshotRow, but are still read defensively.

export const DB_DATA_SOURCE: Readonly<Record<AnimeDataSource, DbDataSource>> = {
  anilist: 'ANILIST',
  jikan: 'JIKAN',
};
export const DB_ID_SOURCE: Readonly<Record<AnimeIdSource, DbIdSource>> = {
  anilist: 'ANILIST',
  myanimelist: 'MYANIMELIST',
};
const DATA_SOURCE: Readonly<Record<DbDataSource, AnimeDataSource>> = {
  ANILIST: 'anilist',
  JIKAN: 'jikan',
};
const ID_SOURCE: Readonly<Record<DbIdSource, AnimeIdSource>> = {
  ANILIST: 'anilist',
  MYANIMELIST: 'myanimelist',
};

export const ANIME_WITH_DATA = {
  externalIds: true,
  snapshots: true,
} satisfies Prisma.AnimeInclude;

export type AnimeRow = Prisma.AnimeGetPayload<{
  include: typeof ANIME_WITH_DATA;
}>;
type SnapshotRow = AnimeRow['snapshots'][number];

/** Columns of anime_source_snapshot for one source's view of an anime. */
export function toSnapshotRow(snapshot: AnimeSnapshot, fetchedAt: Date) {
  return {
    fetchedAt,
    sourceUrl: snapshot.sourceUrl,
    titleRomaji: snapshot.titleRomaji,
    titleEnglish: snapshot.titleEnglish,
    titleNative: snapshot.titleNative,
    synonyms: [...snapshot.synonyms],
    format: snapshot.format,
    status: snapshot.status,
    startYear: snapshot.startDate?.year ?? null,
    startMonth: snapshot.startDate?.month ?? null,
    startDay: snapshot.startDate?.day ?? null,
    endYear: snapshot.endDate?.year ?? null,
    endMonth: snapshot.endDate?.month ?? null,
    endDay: snapshot.endDate?.day ?? null,
    season: snapshot.season,
    seasonYear: snapshot.seasonYear,
    episodes: snapshot.episodes,
    durationMinutes: snapshot.durationMinutes,
    synopsis: snapshot.synopsis,
    coverImageUrl: snapshot.coverImageUrl,
    bannerImageUrl: snapshot.bannerImageUrl,
    trailerSite: snapshot.trailer?.site ?? null,
    trailerId: snapshot.trailer?.id ?? null,
    genres: [...snapshot.genres],
    tags: snapshot.tags.map((tag) => ({ ...tag })),
    studios: snapshot.studios.map((studio) => ({ ...studio })),
    links: snapshot.links.map((link) => ({ ...link })),
    score: snapshot.score,
    scoredBy: snapshot.scoredBy,
    rank: snapshot.rank,
    members: snapshot.members,
    nextEpisode: snapshot.nextEpisode?.episode ?? null,
    nextEpisodeAiringAt: snapshot.nextEpisode?.airingAt ?? null,
    creators: [...snapshot.creators],
    favourites: snapshot.favourites,
    rankRated: snapshot.rankRated,
    rankPopular: snapshot.rankPopular,
    coverColor: snapshot.coverColor,
  } satisfies Omit<
    Prisma.AnimeSourceSnapshotUncheckedCreateInput,
    'animeId' | 'source'
  >;
}

function rowDate(
  year: number | null,
  month: number | null,
  day: number | null,
): PartialDate | null {
  return year === null ? null : { year, month, day };
}

function jsonArray<T>(
  value: Prisma.JsonValue,
  read: (item: unknown) => T | null,
): T[] {
  return Array.isArray(value)
    ? value.map(read).filter((item) => item !== null)
    : [];
}

function readTag(value: unknown): AnimeTag | null {
  const tag = record(value);
  const name = text(tag.name);
  return name === null
    ? null
    : { name, rank: integer(tag.rank), spoiler: tag.spoiler === true };
}

function readStudio(value: unknown): AnimeStudio | null {
  const studio = record(value);
  const name = text(studio.name);
  return name === null ? null : { name, main: studio.main === true };
}

function readLink(value: unknown): AnimeLink | null {
  const link = record(value);
  const site = text(link.site);
  const url = text(link.url);
  const kind = oneOf(link.kind, ['streaming', 'other'] as const);
  return site === null || url === null || kind === null
    ? null
    : { site, url, kind };
}

function readTrailer(row: SnapshotRow): AnimeTrailer | null {
  const site = oneOf(row.trailerSite, ['youtube', 'dailymotion'] as const);
  return site === null || row.trailerId === null
    ? null
    : { site, id: row.trailerId };
}

function fromSnapshotRow(row: SnapshotRow): StoredSnapshot {
  return {
    source: DATA_SOURCE[row.source],
    fetchedAt: row.fetchedAt,
    snapshot: {
      sourceUrl: row.sourceUrl,
      titleRomaji: row.titleRomaji,
      titleEnglish: row.titleEnglish,
      titleNative: row.titleNative,
      synonyms: row.synonyms,
      format: row.format,
      status: row.status,
      startDate: rowDate(row.startYear, row.startMonth, row.startDay),
      endDate: rowDate(row.endYear, row.endMonth, row.endDay),
      season: row.season,
      seasonYear: row.seasonYear,
      episodes: row.episodes,
      durationMinutes: row.durationMinutes,
      synopsis: row.synopsis,
      coverImageUrl: row.coverImageUrl,
      bannerImageUrl: row.bannerImageUrl,
      trailer: readTrailer(row),
      genres: row.genres,
      tags: jsonArray(row.tags, readTag),
      studios: jsonArray(row.studios, readStudio),
      links: jsonArray(row.links, readLink),
      score: row.score,
      scoredBy: row.scoredBy,
      rank: row.rank,
      members: row.members,
      nextEpisode:
        row.nextEpisode === null || row.nextEpisodeAiringAt === null
          ? null
          : { episode: row.nextEpisode, airingAt: row.nextEpisodeAiringAt },
      creators: row.creators,
      favourites: row.favourites,
      rankRated: row.rankRated,
      rankPopular: row.rankPopular,
      coverColor: row.coverColor,
    },
  };
}

export function fromAnimeRow(row: AnimeRow): StoredAnime {
  return {
    id: row.id,
    lastViewedAt: row.lastViewedAt,
    externalIds: row.externalIds.map(({ source, externalId }) => ({
      source: ID_SOURCE[source],
      externalId,
    })),
    snapshots: row.snapshots.map(fromSnapshotRow),
  };
}
