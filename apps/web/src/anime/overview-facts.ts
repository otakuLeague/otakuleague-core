import type { AnimeDetails, PartialDate } from '@otakuleague/shared-types';
import { type HeaderFacts, headerFacts } from './header-facts';
import { type OverviewTrailer, trailerOf } from './trailer';

/** Above this many characters (or with more than one paragraph) the synopsis collapses. */
export const SYNOPSIS_CLAMP_CHARS = 350;
/** Third-party data is bounded before it reaches the page. */
const SYNOPSIS_MAX_CHARS = 20_000;
const GENRES_MAX = 20;
const STUDIOS_MAX = 10;
const CREATORS_MAX = 10;
/** Longer runtimes are source errors, never shown: a whole work over a day, an episode over 5 h. */
const RUNTIME_MAX_MINUTES = 24 * 60;
const EPISODE_MAX_MINUTES = 300;

export interface OverviewSynopsis {
  /** Plain text, never HTML; never empty. */
  readonly paragraphs: readonly string[];
  /** "Crunchyroll" from a trailing "(Source: Crunchyroll)". */
  readonly source: string | null;
  /**
   * Decided on the server, so nothing shifts after hydration. `paragraph`: collapsed shows the
   * whole first paragraph; `clamp`: the first paragraph is long, so it is clamped with a fade.
   */
  readonly collapse: 'none' | 'paragraph' | 'clamp';
}

/** One end of the airing span: `datetime` is ISO ("2013", "2013-04", "2013-04-07"). */
export interface OverviewDate {
  readonly datetime: string;
  readonly label: string;
}

export type OverviewAired =
  | { readonly kind: 'single'; readonly start: OverviewDate }
  /** Still airing: only the start is shown (the Status row says "Airing"). */
  | { readonly kind: 'airing'; readonly start: OverviewDate }
  | {
      readonly kind: 'range';
      readonly start: OverviewDate;
      readonly end: OverviewDate;
    };

/** Everything the Overview shows; null (or empty) when AniList lacks it. */
export interface OverviewFacts {
  /** The page title, for the trailer's iframe title. */
  readonly title: string;
  readonly trailer: OverviewTrailer | null;
  readonly synopsis: OverviewSynopsis | null;
  readonly format: string | null;
  /** "28", or "1180 so far" while airing without a total. */
  readonly episodes: string | null;
  /** "24 min per ep", or the whole runtime of a movie or a single episode: "1 h 47 min". */
  readonly duration: string | null;
  readonly status: string | null;
  readonly aired: OverviewAired | null;
  readonly season: string | null;
  readonly studios: readonly string[];
  readonly creators: readonly string[];
  readonly genres: readonly string[];
}

/** One row of the Information card; `datetime` makes the value a `<time>`. */
export interface InformationRow {
  readonly label: string;
  readonly text: string;
  readonly datetime?: string;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Matched on the text's last 200 characters only: linear, whatever the source sends. */
const SOURCE_NOTE = /\(Source:([^()]*)\)$/iu;

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function synopsisOf(text: string | undefined): OverviewSynopsis | null {
  const trimmed = text?.slice(0, SYNOPSIS_MAX_CHARS).trim() ?? '';
  const match = SOURCE_NOTE.exec(trimmed.slice(-200));
  const body = match ? trimmed.slice(0, -match[0].length) : trimmed;
  const source = match?.[1]?.trim() ?? '';
  const paragraphs = body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const first = paragraphs[0];
  if (first === undefined) return null;
  const collapse =
    first.length > SYNOPSIS_CLAMP_CHARS
      ? 'clamp'
      : paragraphs.length > 1
        ? 'paragraph'
        : 'none';
  return { paragraphs, source: source === '' ? null : source, collapse };
}

function dateOf(date: PartialDate | undefined): OverviewDate | null {
  const year = count(date?.year);
  if (date === undefined || year === null || year < 1900 || year > 2100) {
    return null;
  }
  const month = count(date.month);
  const monthIndex = month !== null && month <= 12 ? month : null;
  const day = monthIndex === null ? null : count(date.day);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (monthIndex === null) return { datetime: `${year}`, label: `${year}` };
  const monthLabel = `${MONTHS[monthIndex - 1]} ${year}`;
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  if (day === null || day > daysInMonth) {
    return { datetime: `${year}-${pad(monthIndex)}`, label: monthLabel };
  }
  return {
    datetime: `${year}-${pad(monthIndex)}-${pad(day)}`,
    label: `${day} ${monthLabel}`,
  };
}

function airedOf(anime: AnimeDetails): OverviewAired | null {
  const start = dateOf(anime.startDate?.value);
  if (start === null) return null;
  if (anime.status?.value === 'RELEASING') return { kind: 'airing', start };
  const end = dateOf(anime.endDate?.value);
  // ISO strings of any precision compare in order; an end before the start is a source error.
  return end === null || end.datetime <= start.datetime
    ? { kind: 'single', start }
    : { kind: 'range', start, end };
}

function episodesOf(header: HeaderFacts, total: number | null): string | null {
  if (total !== null) return `${total}`;
  // headerFacts only keeps a next episode while airing, with a valid date.
  const next = count(header.nextEpisode?.episode);
  return next !== null && next > 1 ? `${next - 1} so far` : null;
}

function runtimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Per episode for a series; the whole runtime for a movie or a single episode. */
export function durationOf(anime: AnimeDetails): string | null {
  const minutes = count(anime.durationMinutes?.value);
  if (minutes === null) return null;
  const episodes = count(anime.episodes?.value);
  const whole =
    episodes === 1 || (anime.format?.value === 'MOVIE' && episodes === null);
  if (whole)
    return minutes > RUNTIME_MAX_MINUTES ? null : runtimeLabel(minutes);
  return minutes > EPISODE_MAX_MINUTES ? null : `${minutes} min per ep`;
}

export function overviewFacts(anime: AnimeDetails): OverviewFacts {
  const header = headerFacts(anime);
  return {
    title: header.title,
    trailer: trailerOf(anime),
    // Only AniList's synopsis is cleared for display; MyAnimeList text waits on OTA-127 (ADR 0006).
    synopsis:
      anime.synopsis?.source === 'anilist'
        ? synopsisOf(anime.synopsis.value)
        : null,
    format: header.format,
    episodes: episodesOf(header, count(anime.episodes?.value)),
    duration: durationOf(anime),
    status: header.status?.label ?? null,
    aired: airedOf(anime),
    season: header.season?.label ?? null,
    studios: header.studios.slice(0, STUDIOS_MAX),
    creators: header.creators.slice(0, CREATORS_MAX),
    genres: [
      ...new Set((anime.genres?.value ?? []).map((genre) => genre.trim())),
    ]
      .filter((genre) => genre !== '')
      .slice(0, GENRES_MAX),
  };
}

function airedRows(aired: OverviewAired | null): readonly InformationRow[] {
  if (aired === null) return [];
  const start = {
    label: 'Start date',
    text: aired.start.label,
    datetime: aired.start.datetime,
  };
  switch (aired.kind) {
    case 'single':
    case 'airing':
      return [start];
    case 'range':
      return [
        start,
        {
          label: 'End date',
          text: aired.end.label,
          datetime: aired.end.datetime,
        },
      ];
    default: {
      const unknown: never = aired;
      return unknown;
    }
  }
}

function listRow(
  one: string,
  many: string,
  values: readonly string[],
): readonly InformationRow[] {
  if (values.length === 0) return [];
  return [{ label: values.length > 1 ? many : one, text: values.join(', ') }];
}

function textRow(
  label: string,
  text: string | null,
): readonly InformationRow[] {
  return text === null ? [] : [{ label, text }];
}

/** The Information card's rows in display order; a value AniList lacks has no row. */
export function informationRows(
  facts: OverviewFacts,
): readonly InformationRow[] {
  return [
    ...textRow('Format', facts.format),
    ...textRow('Episodes', facts.episodes),
    ...textRow('Duration', facts.duration),
    ...textRow('Status', facts.status),
    ...airedRows(facts.aired),
    ...textRow('Season', facts.season),
    ...listRow('Studio', 'Studios', facts.studios),
    ...textRow(
      'Created by',
      facts.creators.length > 0 ? facts.creators.join(', ') : null,
    ),
  ];
}
