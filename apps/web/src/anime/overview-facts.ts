import type { AnimeDetails, PartialDate } from '@otakuleague/shared-types';
import { type HeaderFacts, headerFacts } from './header-facts';

/** Above this many characters (or with more than one paragraph) the synopsis collapses. */
export const SYNOPSIS_CLAMP_CHARS = 350;
/** Third-party data is bounded before it reaches the page. */
const SYNOPSIS_MAX_CHARS = 20_000;
const GENRES_MAX = 20;
const STUDIOS_MAX = 10;

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
  | { readonly kind: 'airing'; readonly start: OverviewDate }
  /** Not yet released: the row reads "Premieres". */
  | { readonly kind: 'upcoming'; readonly start: OverviewDate }
  | {
      readonly kind: 'range';
      readonly start: OverviewDate;
      readonly end: OverviewDate;
    };

/** Everything the Overview's synopsis and Details card show; null when AniList lacks it. */
export interface OverviewFacts {
  readonly synopsis: OverviewSynopsis | null;
  readonly format: string | null;
  /** "28 × 24 min", or "1180 so far × 24 min" while airing without a total. */
  readonly episodes: string | null;
  readonly aired: OverviewAired | null;
  readonly season: string | null;
  readonly studios: readonly string[];
  readonly genres: readonly string[];
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
  if (anime.status?.value === 'NOT_YET_RELEASED') {
    return { kind: 'upcoming', start };
  }
  const end = dateOf(anime.endDate?.value);
  // ISO strings of any precision compare in order; an end before the start is a source error.
  return end === null || end.datetime <= start.datetime
    ? { kind: 'single', start }
    : { kind: 'range', start, end };
}

function episodesOf(anime: AnimeDetails, header: HeaderFacts): string | null {
  // headerFacts only keeps a next episode while airing, with a valid date.
  const next = count(header.nextEpisode?.episode);
  const total =
    count(anime.episodes?.value) ??
    (next !== null && next > 1 ? `${next - 1} so far` : null);
  if (total === null) return null;
  const minutes = count(anime.durationMinutes?.value);
  return minutes === null ? `${total}` : `${total} × ${minutes} min`;
}

export function overviewFacts(anime: AnimeDetails): OverviewFacts {
  const header = headerFacts(anime);
  return {
    // Only AniList's synopsis is cleared for display; MyAnimeList text waits on OTA-127 (ADR 0006).
    synopsis:
      anime.synopsis?.source === 'anilist'
        ? synopsisOf(anime.synopsis.value)
        : null,
    format: header.format,
    episodes: episodesOf(anime, header),
    aired: airedOf(anime),
    season: header.season?.label ?? null,
    studios: header.studios.slice(0, STUDIOS_MAX),
    genres: [
      ...new Set((anime.genres?.value ?? []).map((genre) => genre.trim())),
    ]
      .filter((genre) => genre !== '')
      .slice(0, GENRES_MAX),
  };
}

/** Whether the Details card has anything to show; otherwise it is not rendered. */
export function hasDetails(facts: OverviewFacts): boolean {
  return (
    facts.format !== null ||
    facts.episodes !== null ||
    facts.aired !== null ||
    facts.season !== null ||
    facts.studios.length > 0 ||
    facts.genres.length > 0
  );
}
