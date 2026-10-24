import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import { notFound, permanentRedirect } from 'next/navigation';
import { resolveAnimeSlug } from './data';
import { type AnimeTabSegment, tabHref } from './tabs';

/**
 * Run by every tab page before anything renders (the route is blocking, `instant = false`), so
 * an alias, a former slug or another letter case gets a real HTTP 308 to the canonical slug,
 * on the same tab, and an unknown or removed anime a real 404 (OTA-97).
 */
export async function resolveTab(
  slug: string,
  segment: AnimeTabSegment,
): Promise<AnimeSlugResolution> {
  const result = await resolveAnimeSlug(slug);
  if (!result.ok) {
    // 404: no anime has this slug, or it was removed; 400: not a well-formed slug.
    if (
      result.failure.kind === 'api_error' &&
      (result.failure.status === 404 || result.failure.status === 400)
    ) {
      notFound();
    }
    throw new Error(`Could not resolve anime slug (${result.failure.kind})`);
  }
  if (result.data.canonicalSlug !== slug) {
    permanentRedirect(tabHref(result.data.canonicalSlug, segment));
  }
  return result.data;
}
