import {
  ANIME_FORMATS,
  ANIME_STATUSES,
  type AnimeFormat,
  AnimeLink,
  AnimeSeason,
  AnimeStatus,
  AnimeStudio,
  AnimeTag,
  AnimeTrailer,
} from '@otakuleague/shared-types';
import {
  finite,
  httpUrl,
  integer,
  oneOf,
  partialDate,
  record,
  synopsisText,
  text,
  texts,
} from './parse';
import {
  type AnimeRef,
  type AnimeSnapshot,
  MANGA_FORMATS,
  MEDIA_RELATIONS,
  type MediaSummary,
  type RelationNode,
} from './source.types';

const FORMATS: readonly AnimeFormat[] = [
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
];
const STATUSES: readonly AnimeStatus[] = [
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
];
const SEASONS: readonly AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const TRAILER_SITES: readonly AnimeTrailer['site'][] = [
  'youtube',
  'dailymotion',
];

function trailer(value: unknown): AnimeTrailer | null {
  const raw = record(value);
  // AniList returned Attack on Titan's id with a trailing tab: text() trims it.
  const id = text(raw.id);
  const site = oneOf(raw.site, TRAILER_SITES);
  return id !== null && site !== null ? { site, id } : null;
}

function tags(value: unknown): AnimeTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const tag = record(item);
    const name = text(tag.name);
    if (name === null) return [];
    const rank = integer(tag.rank);
    return [
      {
        name,
        rank: rank !== null && rank <= 100 ? rank : null,
        spoiler: tag.isGeneralSpoiler === true || tag.isMediaSpoiler === true,
      },
    ];
  });
}

function studios(value: unknown): AnimeStudio[] {
  const edges = record(value).edges;
  if (!Array.isArray(edges)) return [];
  return edges.flatMap((item) => {
    const edge = record(item);
    const name = text(record(edge.node).name);
    return name === null ? [] : [{ name, main: edge.isMain === true }];
  });
}

function links(value: unknown): AnimeLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const link = record(item);
    const site = text(link.site);
    const url = httpUrl(link.url);
    if (site === null || url === null) return [];
    return [
      { site, url, kind: link.type === 'STREAMING' ? 'streaming' : 'other' },
    ];
  });
}

function nextEpisode(value: unknown): AnimeSnapshot['nextEpisode'] {
  const raw = record(value);
  const episode = integer(raw.episode, 1);
  const airingAt = integer(raw.airingAt, 1);
  // airingAt is Unix seconds.
  return episode !== null && airingAt !== null
    ? { episode, airingAt: new Date(airingAt * 1000) }
    : null;
}

/** `data.Media` of ANILIST_ANIME_QUERY to our model; null when there is no media object. */
export function mapAniListMedia(value: unknown): AnimeSnapshot | null {
  const media = record(value);
  const id = integer(media.id, 1);
  if (id === null) return null;
  const malId = integer(media.idMal, 1);
  const ids: AnimeRef[] = [{ source: 'anilist', externalId: id }];
  if (malId !== null) ids.push({ source: 'myanimelist', externalId: malId });
  const title = record(media.title);
  const cover = record(media.coverImage);
  const score = finite(media.averageScore);
  return {
    ids,
    sourceUrl: httpUrl(media.siteUrl) ?? `https://anilist.co/anime/${id}`,
    adult: media.isAdult === true,
    titleRomaji: text(title.romaji),
    titleEnglish: text(title.english),
    titleNative: text(title.native),
    synonyms: texts(media.synonyms),
    format: oneOf(media.format, FORMATS),
    status: oneOf(media.status, STATUSES),
    startDate: partialDate(media.startDate),
    endDate: partialDate(media.endDate),
    season: oneOf(media.season, SEASONS),
    seasonYear: integer(media.seasonYear, 1),
    episodes: integer(media.episodes, 1),
    durationMinutes: integer(media.duration, 1),
    synopsis: synopsisText(media.description),
    coverImageUrl: httpUrl(cover.extraLarge) ?? httpUrl(cover.large),
    bannerImageUrl: httpUrl(media.bannerImage),
    trailer: trailer(media.trailer),
    genres: texts(media.genres),
    tags: tags(media.tags),
    studios: studios(media.studios),
    links: links(media.externalLinks),
    score: score !== null && score >= 0 && score <= 100 ? score : null,
    scoredBy: null,
    rank: null,
    members: integer(media.popularity),
    nextEpisode: nextEpisode(media.nextAiringEpisode),
  };
}

/**
 * One media object of ANILIST_RELATIONS_QUERY; null when unusable or not known to be safe:
 * adult entries are never stored (ADR 0006 update), and a missing isAdult counts as adult.
 */
function mediaSummary(value: unknown): MediaSummary | null {
  const media = record(value);
  const anilistId = integer(media.id, 1);
  if (anilistId === null || media.isAdult !== false) return null;
  const title = record(media.title);
  const fields = {
    anilistId,
    status: oneOf(media.status, ANIME_STATUSES),
    startDate: partialDate(media.startDate),
    titleEnglish: text(title.english),
    titleRomaji: text(title.romaji),
    coverImageUrl: httpUrl(record(media.coverImage).large),
  };
  if (media.type === 'ANIME') {
    return {
      ...fields,
      mediaType: 'ANIME',
      format: oneOf(media.format, ANIME_FORMATS),
    };
  }
  if (media.type === 'MANGA') {
    return {
      ...fields,
      mediaType: 'MANGA',
      format: oneOf(media.format, MANGA_FORMATS),
    };
  }
  return null;
}

/**
 * `data` of ANILIST_RELATIONS_QUERY to our model (ADR 0008). An adult or unusable entry is
 * dropped, and so is an edge whose relation type we do not know (AniList adds types per
 * version): the rest of the walk goes on.
 */
export function mapAniListRelationNodes(value: unknown): RelationNode[] {
  const media = record(record(value).Page).media;
  if (!Array.isArray(media)) return [];
  return media.flatMap((mediaValue) => {
    const summary = mediaSummary(mediaValue);
    if (summary === null || summary.mediaType !== 'ANIME') return [];
    const edges = record(record(mediaValue).relations).edges;
    return [
      {
        ...summary,
        edges: (Array.isArray(edges) ? edges : []).flatMap((edgeValue) => {
          const edge = record(edgeValue);
          const relation = oneOf(edge.relationType, MEDIA_RELATIONS);
          const target = mediaSummary(edge.node);
          return relation === null || target === null
            ? []
            : [{ relation, target }];
        }),
      },
    ];
  });
}
