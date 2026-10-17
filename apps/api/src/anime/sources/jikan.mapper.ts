import type {
  AnimeFormat,
  AnimeSeason,
  AnimeStatus,
  AnimeTag,
  AnimeTrailer,
} from '@otakuleague/shared-types';
import {
  finite,
  httpUrl,
  integer,
  partialDate,
  record,
  synopsisText,
  text,
  texts,
} from './parse';
import type { AnimeSnapshot } from './source.types';

// Jikan's labels are MyAnimeList's display strings.
const FORMATS: Readonly<Record<string, AnimeFormat>> = {
  TV: 'TV',
  Movie: 'MOVIE',
  OVA: 'OVA',
  ONA: 'ONA',
  Special: 'SPECIAL',
  'TV Special': 'SPECIAL',
  Music: 'MUSIC',
};
const STATUSES: Readonly<Record<string, AnimeStatus>> = {
  'Finished Airing': 'FINISHED',
  'Currently Airing': 'RELEASING',
  'Not yet aired': 'NOT_YET_RELEASED',
};
const SEASONS: Readonly<Record<string, AnimeSeason>> = {
  winter: 'WINTER',
  spring: 'SPRING',
  summer: 'SUMMER',
  fall: 'FALL',
};

function lookup<T>(
  table: Readonly<Record<string, T>>,
  value: unknown,
): T | null {
  return typeof value === 'string' && Object.hasOwn(table, value)
    ? (table[value] ?? null)
    : null;
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? texts(value.map((item) => record(item).name))
    : [];
}

function youtubeTrailer(value: unknown): AnimeTrailer | null {
  const id = text(value);
  return id === null ? null : { site: 'youtube', id };
}

/** "24 min per ep", "1 hr 55 min", "30 sec per ep" -> whole minutes. */
export function durationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const hours = Number(/(\d+)\s*hr/.exec(value)?.[1] ?? 0);
  const minutes = Number(/(\d+)\s*min/.exec(value)?.[1] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

/** `data` of GET /v4/anime/{id} to our model; null when there is no anime object. */
export function mapJikanAnime(value: unknown): AnimeSnapshot | null {
  const anime = record(value);
  const malId = integer(anime.mal_id, 1);
  if (malId === null) return null;
  const images = record(anime.images);
  const aired = record(record(anime.aired).prop);
  const score = finite(anime.score);
  // Themes and demographics are MAL's closest thing to tags; MAL ranks none of them.
  const tags: AnimeTag[] = [
    ...names(anime.themes),
    ...names(anime.demographics),
  ].map((name) => ({ name, rank: null, spoiler: false }));
  return {
    ids: [{ source: 'myanimelist', externalId: malId }],
    sourceUrl: httpUrl(anime.url) ?? `https://myanimelist.net/anime/${malId}`,
    adult: typeof anime.rating === 'string' && anime.rating.startsWith('Rx'),
    titleRomaji: text(anime.title),
    titleEnglish: text(anime.title_english),
    titleNative: text(anime.title_japanese),
    synonyms: texts(anime.title_synonyms),
    format: lookup(FORMATS, anime.type),
    status: lookup(STATUSES, anime.status),
    startDate: partialDate(aired.from),
    endDate: partialDate(aired.to),
    season: lookup(SEASONS, anime.season),
    seasonYear: integer(anime.year, 1),
    episodes: integer(anime.episodes, 1),
    durationMinutes: durationMinutes(anime.duration),
    synopsis: synopsisText(anime.synopsis),
    coverImageUrl:
      httpUrl(record(images.webp).large_image_url) ??
      httpUrl(record(images.jpg).large_image_url),
    bannerImageUrl: null,
    trailer: youtubeTrailer(record(anime.trailer).youtube_id),
    genres: names(anime.genres),
    tags,
    // MAL does not say which studio is the main one.
    studios: names(anime.studios).map((name) => ({ name, main: true })),
    links: [],
    score: score !== null && score >= 1 && score <= 10 ? score : null,
    scoredBy: integer(anime.scored_by),
    rank: integer(anime.rank, 1),
    members: integer(anime.members),
    nextEpisode: null,
    // AniList-only fields (OTA-97): one primary source per field (ADR 0006).
    creators: [],
    favourites: null,
    rankRated: null,
    rankPopular: null,
    coverColor: null,
  };
}
