import { type AnimeTabSegment, tabHref } from './tabs';

/** What every anime link is built from: a list card, a franchise season (ADR 0018). */
export interface AnimeLinkTarget {
  readonly anilistId: number;
  readonly slug: string | null;
  /** Absent from an older API: read as not imported. */
  readonly imported?: boolean;
}

export interface AnimeLink {
  readonly href: string;
  readonly rel: 'nofollow' | undefined;
}

/**
 * Where an anime opens, on this tab. A slug alone is only claimed (OTA-190): its page exists
 * once imported. Anything else goes through the AniList id route, which imports it and redirects
 * to the slug (OTA-172), nofollow so a crawler never starts an import (OTA-173, ADR 0018).
 */
export function animeLink(
  target: AnimeLinkTarget,
  segment: AnimeTabSegment = '',
): AnimeLink {
  if (target.imported === true && target.slug !== null) {
    return { href: tabHref(target.slug, segment), rel: undefined };
  }
  const base = `/anime/anilist/${target.anilistId}`;
  return {
    href: segment === '' ? base : `${base}/${segment}`,
    rel: 'nofollow',
  };
}
