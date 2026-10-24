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
