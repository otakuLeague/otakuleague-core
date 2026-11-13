import { CANONICAL_SLUG_PATTERN } from '@otakuleague/shared-types';
import { notFound, redirect } from 'next/navigation';
import { loadAnimeByAnilistId } from './data';
import { tabHref, tabSegmentFromParam } from './tabs';

/** A positive AniList id, no leading zero, at most nine digits (fits an Int). */
const ANILIST_ID = /^[1-9]\d{0,8}$/;

/**
 * The season selector's link to a season not imported yet (OTA-172): imports it through the
 * API, then a temporary redirect to its canonical slug on the same tab. Not permanent: the
 * slug can still change, and the page itself is noindex (X-Robots-Tag on /anime/anilist/*).
 * A 429 (too many new anime importing at once, OTA-173) is expected: the page shows a calm
 * "try again" state instead of the error page.
 */
export async function seasonRedirect(
  id: string,
  tab: readonly string[] | undefined,
): Promise<'import_limit_reached'> {
  const segment = tabSegmentFromParam(tab);
  if (!ANILIST_ID.test(id) || segment === null) notFound();
  const result = await loadAnimeByAnilistId(Number(id));
  if (!result.ok) {
    // 404: no source knows this id, or it is adult content; 400: not a well-formed id.
    if (
      result.failure.kind === 'api_error' &&
      (result.failure.status === 404 || result.failure.status === 400)
    ) {
      notFound();
    }
    if (result.failure.kind === 'api_error' && result.failure.status === 429) {
      return 'import_limit_reached';
    }
    throw new Error(
      `Could not load anime by AniList id (${result.failure.kind})`,
    );
  }
  const slug = result.data.canonicalSlug;
  if (slug === null) notFound();
  // A drifted body (invalid_response): an outage, not a missing anime.
  if (typeof slug !== 'string' || !CANONICAL_SLUG_PATTERN.test(slug)) {
    throw new Error('Unexpected anime slug from the API');
  }
  redirect(tabHref(slug, segment));
}
