import type { AnimeFranchise } from '@otakuleague/shared-types';

/** The anime page's tabs (OTA-97): each its own route under /anime/[slug]; Overview is bare. */
export const ANIME_TABS = [
  { segment: '', label: 'Overview' },
  { segment: 'episodes', label: 'Episodes' },
  { segment: 'cast', label: 'Cast & Crew' },
  { segment: 'music', label: 'Music' },
  { segment: 'related', label: 'Related & Media' },
  { segment: 'stats', label: 'Stats' },
  { segment: 'community', label: 'Community' },
] as const;

export type AnimeTab = (typeof ANIME_TABS)[number];
export type AnimeTabSegment = AnimeTab['segment'];

export function tabHref(slug: string, segment: AnimeTabSegment): string {
  const base = `/anime/${encodeURIComponent(slug)}`;
  return segment === '' ? base : `${base}/${segment}`;
}

export function tabLabel(segment: AnimeTabSegment): string {
  return ANIME_TABS.find((tab) => tab.segment === segment)?.label ?? '';
}

const TAB_SEGMENTS: readonly string[] = ANIME_TABS.map(
  ({ segment }) => segment,
);

function isTabSegment(segment: string): segment is AnimeTabSegment {
  return segment !== '' && TAB_SEGMENTS.includes(segment);
}

/** The tab a pathname shows for this slug; Overview for anything else. */
export function tabSegmentOf(pathname: string, slug: string): AnimeTabSegment {
  const prefix = `${tabHref(slug, '')}/`;
  if (!pathname.startsWith(prefix)) return '';
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  return isTabSegment(rest) ? rest : '';
}

/** One main-line entry of the season selector, trimmed from the franchise (OTA-97). */
export interface SeasonOption {
  readonly anilistId: number;
  /** Null until imported: shown but not linked yet (OTA-97 follow-up). */
  readonly slug: string | null;
  readonly label: string;
  readonly year: number | null;
  readonly isCurrent: boolean;
  readonly upcoming: boolean;
}

/** The selector's seasons, or null when there is nothing to switch between. */
export function seasonOptions(
  franchise: AnimeFranchise | null,
): readonly SeasonOption[] | null {
  if (franchise === null || franchise.state === 'unavailable') return null;
  if (franchise.mainLine.length < 2) return null;
  return franchise.mainLine.map((season) => ({
    anilistId: season.anilistId,
    slug: season.slug,
    label: season.label,
    year: season.startDate?.year ?? null,
    isCurrent: season.isCurrent,
    upcoming: season.status === 'NOT_YET_RELEASED',
  }));
}
