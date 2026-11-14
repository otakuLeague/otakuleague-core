import type { AnimeFranchiseView } from '@otakuleague/shared-types';

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

/** The tab an optional catch-all `[[...tab]]` param names: Overview when absent, null if unknown. */
export function tabSegmentFromParam(
  tab: readonly string[] | undefined,
): AnimeTabSegment | null {
  if (tab === undefined || tab.length === 0) return '';
  const [segment] = tab;
  return tab.length === 1 && segment !== undefined && isTabSegment(segment)
    ? segment
    : null;
}

/** One main-line entry of the season selector, trimmed from the franchise (OTA-97). */
export interface SeasonOption {
  readonly anilistId: number;
  /** Null until claimed (OTA-190); a claimed slug is linked only once imported (`animeLink`). */
  readonly slug: string | null;
  /** False for a missing flag (older API, ADR 0018). */
  readonly imported: boolean;
  readonly label: string;
  readonly year: number | null;
  readonly isCurrent: boolean;
  readonly upcoming: boolean;
}

/** The selector's seasons, or null when the main line has no other season to switch to. */
export function seasonOptions(
  franchise: AnimeFranchiseView | null,
): readonly SeasonOption[] | null {
  if (franchise === null || franchise.state === 'unavailable') return null;
  if (franchise.mainLine.length < 2) return null;
  return franchise.mainLine.map((season) => ({
    anilistId: season.anilistId,
    slug: season.slug,
    imported: season.imported === true,
    label: season.label,
    year: season.startDate?.year ?? null,
    isCurrent: season.isCurrent,
    upcoming: season.status === 'NOT_YET_RELEASED',
  }));
}
