import type { AnimeDetails, PartialDate } from '@otakuleague/shared-types';
import { headerFacts } from './header-facts';

/** Above this many characters (or with more than one paragraph) the synopsis collapses. */
export const SYNOPSIS_CLAMP_CHARS = 350;

export interface OverviewSynopsis {
  /** Plain text, never HTML; never empty. */
  readonly paragraphs: readonly string[];
  /** "Crunchyroll" from a trailing "(Source: Crunchyroll)". */
  readonly source: string | null;
  /** Decided on the server, so nothing shifts after hydration. */
  readonly collapsible: boolean;
}

/** One end of the airing span: `datetime` is ISO ("2013", "2013-04", "2013-04-07"). */
export interface OverviewDate {
  readonly datetime: string;
  readonly label: string;
}

export type OverviewAired =
  | { readonly kind: 'single'; readonly start: OverviewDate }
  | { readonly kind: 'airing'; readonly start: OverviewDate }
  | {
      readonly kind: 'range';
      readonly start: OverviewDate;
      readonly end: OverviewDate;
    };

/** Everything the Overview's synopsis and Details card show; null when AniList lacks it. */
export interface OverviewFacts {
  readonly synopsis: OverviewSynopsis | null;
  readonly format: string | null;
  /** "28 × 24 min", or "1180 so far" while airing without a total. */
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

const SOURCE_NOTE = /\s*\(Source:\s*([^()]+?)\s*\)\s*$/iu;

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function synopsisOf(text: string | undefined): OverviewSynopsis | null {
  const trimmed = text?.trim() ?? '';
  const match = SOURCE_NOTE.exec(trimmed);
  const body = match ? trimmed.slice(0, match.index) : trimmed;
  const paragraphs = body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  if (paragraphs.length === 0) return null;
  const length = paragraphs.reduce((sum, p) => sum + p.length, 0);
  return {
    paragraphs,
    source: match?.[1] ?? null,
    collapsible: paragraphs.length > 1 || length > SYNOPSIS_CLAMP_CHARS,
  };
}

function dateOf(date: PartialDate | undefined): OverviewDate | null {
  const year = count(date?.year);
  if (date === undefined || year === null) return null;
  const month = count(date.month);
  const monthIndex = month !== null && month <= 12 ? month : null;
  const day = monthIndex === null ? null : count(date.day);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (monthIndex === null) return { datetime: `${year}`, label: `${year}` };
  const monthLabel = `${MONTHS[monthIndex - 1]} ${year}`;
  if (day === null || day > 31) {
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
  return end === null || end.datetime === start.datetime
    ? { kind: 'single', start }
    : { kind: 'range', start, end };
}

function episodesOf(anime: AnimeDetails): string | null {
  const total = count(anime.episodes?.value);
  const minutes = count(anime.durationMinutes?.value);
  if (total !== null) {
    return minutes === null ? `${total}` : `${total} × ${minutes} min`;
  }
  const next = count(anime.nextEpisode?.value.episode);
  if (anime.status?.value === 'RELEASING' && next !== null && next > 1) {
    return `${next - 1} so far`;
  }
  return null;
}

export function overviewFacts(anime: AnimeDetails): OverviewFacts {
  const header = headerFacts(anime);
  return {
    synopsis: synopsisOf(anime.synopsis?.value),
    format: header.format,
    episodes: episodesOf(anime),
    aired: airedOf(anime),
    season: header.season?.label ?? null,
    studios: header.studios,
    genres: (anime.genres?.value ?? []).filter((genre) => genre.trim() !== ''),
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
