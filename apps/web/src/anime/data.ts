import {
  type AnimeBySlug,
  type AnimeDetails,
  type AnimeFranchiseView,
  type AnimeListKind,
  type AnimeListCardPage,
  type AnimeSlugResolution,
  isAnimeFranchise,
  isAnimeListPage,
} from '@otakuleague/shared-types';
import { cache } from 'react';
import { apiClient, type ApiResult } from '../api/client';
import { readClientIp } from '../api/client-ip';

// One API call per request for each, shared by the layout, the tab page and generateMetadata.
// Only the two loaders that can start an import send the visitor's IP (ADR 0019): the others never
// read request headers, so they add no request-time data to a page.

/** Which anime a slug names: database only on the API side, fast even for a purged anime. */
export const resolveAnimeSlug = cache(
  (slug: string): Promise<ApiResult<AnimeSlugResolution>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(slug)}/resolve`),
);

/** The anime itself; may import it on a first visit (a few seconds): only behind Suspense. */
export const loadAnime = cache(
  async (canonicalSlug: string): Promise<ApiResult<AnimeBySlug>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(canonicalSlug)}`, {
      // An import can take longer than the client's default timeout.
      timeoutMs: 15_000,
      clientIp: await readClientIp(),
    }),
);

/** An anime by its AniList id, imported on a first visit (a few seconds): the season links (OTA-172). */
export const loadAnimeByAnilistId = cache(
  async (anilistId: number): Promise<ApiResult<AnimeDetails>> =>
    apiClient().call(`/anime/anilist/${anilistId}`, {
      timeoutMs: 15_000,
      clientIp: await readClientIp(),
    }),
);

/** The season selector's main line (ADR 0008): stored data only, so a short timeout. */
export const loadFranchise = cache(
  (slug: string): Promise<ApiResult<AnimeFranchiseView>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(slug)}/franchise`, {
      timeoutMs: 2_000,
      // A drifted body is an invalid_response: it only hides the selector.
      isExpectedBody: isAnimeFranchise,
    }),
);

/** The first page of a catalog list (ADR 0016), card fields only. A drifted body is an invalid_response. */
export function loadAnimeList(
  kind: AnimeListKind,
  limit: number,
): Promise<ApiResult<AnimeListCardPage>> {
  return apiClient().call(
    `/anime/lists/${encodeURIComponent(kind)}?limit=${limit}`,
    { isExpectedBody: isAnimeListPage },
  );
}
