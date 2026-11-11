import type {
  AnimeDetails,
  AnimeFormat,
  AnimeNextEpisode,
  AnimeSeason,
  AnimeStatus,
} from '@otakuleague/shared-types';
import { animeTitle } from './format';

export type StatusKey =
  'airing' | 'finished' | 'upcoming' | 'hiatus' | 'cancelled';
export type SeasonKey = 'spring' | 'summer' | 'fall' | 'winter';

const STATUSES: Record<
  AnimeStatus,
  { readonly key: StatusKey; readonly label: string }
> = {
  RELEASING: { key: 'airing', label: 'Airing' },
  FINISHED: { key: 'finished', label: 'Finished' },
  NOT_YET_RELEASED: { key: 'upcoming', label: 'Not yet aired' },
  HIATUS: { key: 'hiatus', label: 'On hiatus' },
  CANCELLED: { key: 'cancelled', label: 'Cancelled' },
};

const SEASONS: Record<
  AnimeSeason,
  { readonly key: SeasonKey; readonly label: string }
> = {
  WINTER: { key: 'winter', label: 'Winter' },
  SPRING: { key: 'spring', label: 'Spring' },
  SUMMER: { key: 'summer', label: 'Summer' },
  FALL: { key: 'fall', label: 'Fall' },
};

const FORMATS: Record<AnimeFormat, string> = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};

/** Everything the header and the sticky bar show, each value null when AniList lacks it. */
export interface HeaderFacts {
  readonly title: string;
  /** Native · romaji, without whichever one is already the title. */
  readonly subtitle: string | null;
  /** Shown on the cover placeholder when there is no cover image. */
  readonly initials: string;
  readonly coverUrl: string | null;
  readonly creators: readonly string[];
  readonly studios: readonly string[];
  readonly status: { readonly key: StatusKey; readonly label: string } | null;
  readonly format: string | null;
  readonly season: { readonly key: SeasonKey; readonly label: string } | null;
  /** "25 eps · 24m". */
  readonly runtime: string | null;
  /** "25 eps", for the sticky bar. */
  readonly episodes: string | null;
  /** AniList score out of 100. */
  readonly score: number | null;
  readonly members: string | null;
  readonly favourites: string | null;
  /** "#12 highest rated TV": AniList ranks are per format. */
  readonly rankRated: string | null;
  readonly rankPopular: string | null;
  /** "#69 · #1" (rated · popular), for the sticky bar. */
  readonly ranksShort: string | null;
  /** Only while airing, with a valid date: the countdown. */
  readonly nextEpisode: AnimeNextEpisode | null;
}

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** A count AniList gave, as "110K"; null for none, zero or nonsense (never "0" or "#null"). */
function positive(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : null;
}

function compact(value: number | null | undefined): string | null {
  const count = positive(value);
  return count === null ? null : compactNumber.format(count);
}

function initialsOf(title: string): string {
  const words = title
    .split(/[\s:·-]+/u)
    .filter((word) => /\p{L}|\p{N}/u.test(word));
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .map((word) =>
      word ? ([...word.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? '') : '',
    )
    .join('')
    .toUpperCase();
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function episodesOf(anime: AnimeDetails): string | null {
  const episodes = positive(anime.episodes?.value);
  return episodes === null
    ? null
    : `${episodes} ${episodes === 1 ? 'ep' : 'eps'}`;
}

function runtimeOf(anime: AnimeDetails): string | null {
  const minutes = positive(anime.durationMinutes?.value);
  const parts = [
    episodesOf(anime),
    minutes === null ? null : duration(minutes),
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function rankLabel(
  rank: number | null | undefined,
  kind: string,
  format: string | null,
) {
  const value = positive(rank);
  if (value === null) return null;
  return format === null ? `#${value} ${kind}` : `#${value} ${kind} ${format}`;
}

function shortRanks(anime: AnimeDetails): string | null {
  const ranks = [
    positive(anime.rankRated?.value),
    positive(anime.rankPopular?.value),
  ]
    .filter((rank) => rank !== null)
    .map((rank) => `#${rank}`);
  return ranks.length > 0 ? ranks.join(' · ') : null;
}

/** A next episode with a date we can count down to; an unparseable one is dropped, never "aired". */
function scheduled(
  next: AnimeNextEpisode | undefined,
): AnimeNextEpisode | null {
  return next !== undefined && Number.isFinite(Date.parse(next.airingAt))
    ? next
    : null;
}

export function headerFacts(anime: AnimeDetails): HeaderFacts {
  const title = animeTitle(anime);
  const subtitleParts = [
    anime.titleNative?.value,
    anime.titleRomaji?.value,
  ].filter(
    (part): part is string =>
      part !== undefined && part !== '' && part !== title,
  );
  const format = anime.format ? FORMATS[anime.format.value] : null;
  const season = anime.season ? SEASONS[anime.season.value] : null;
  const year = positive(anime.seasonYear?.value);
  const status = anime.status ? STATUSES[anime.status.value] : null;
  const anilist = anime.scores.find((score) => score.source === 'anilist');
  return {
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : null,
    initials: initialsOf(title),
    coverUrl: anime.coverImageUrl?.value ?? null,
    creators: anime.creators?.value ?? [],
    studios: (anime.studios?.value ?? [])
      .filter((studio) => studio.main)
      .map((studio) => studio.name),
    status,
    format,
    season:
      season === null
        ? null
        : {
            key: season.key,
            label: year === null ? season.label : `${season.label} ${year}`,
          },
    runtime: runtimeOf(anime),
    episodes: episodesOf(anime),
    score: positive(anilist?.score),
    members: compact(anilist?.members),
    favourites: compact(anime.favourites?.value),
    rankRated: rankLabel(anime.rankRated?.value, 'highest rated', format),
    rankPopular: rankLabel(anime.rankPopular?.value, 'most popular', format),
    ranksShort: shortRanks(anime),
    nextEpisode:
      status?.key === 'airing' ? scheduled(anime.nextEpisode?.value) : null,
  };
}

/** Time left until an episode airs, for the countdown: null once it has aired. */
export function countdown(airingAt: string, now: number): string | null {
  const left = Math.floor((Date.parse(airingAt) - now) / 1000);
  if (!Number.isFinite(left) || left <= 0) return null;
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    days > 0 || hours > 0 ? `${hours}h` : null,
    `${String(minutes).padStart(2, '0')}m`,
    `${String(seconds).padStart(2, '0')}s`,
  ];
  return parts.filter((part) => part !== null).join(' ');
}
