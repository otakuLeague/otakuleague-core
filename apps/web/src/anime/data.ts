import {
  type AnimeBySlug,
  type AnimeDetails,
  type AnimeFranchise,
  type AnimeListKind,
  type AnimeListPage,
  type AnimeSlugResolution,
  isAnimeFranchise,
  isAnimeListPage,
} from '@otakuleague/shared-types';
import { cache } from 'react';
import { apiClient, type ApiResult } from '../api/client';

// One API call per request for each, shared by the layout, the tab page and generateMetadata.

/** Which anime a slug names: database only on the API side, fast even for a purged anime. */
export const resolveAnimeSlug = cache(
  (slug: string): Promise<ApiResult<AnimeSlugResolution>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(slug)}/resolve`),
);

/** The anime itself; may import it on a first visit (a few seconds): only behind Suspense. */
export const loadAnime = cache(
  (canonicalSlug: string): Promise<ApiResult<AnimeBySlug>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(canonicalSlug)}`, {
      // An import can take longer than the client's default timeout.
      timeoutMs: 15_000,
    }),
);

/** An anime by its AniList id, imported on a first visit (a few seconds): the season links (OTA-172). */
export const loadAnimeByAnilistId = cache(
  (anilistId: number): Promise<ApiResult<AnimeDetails>> =>
    apiClient().call(`/anime/anilist/${anilistId}`, { timeoutMs: 15_000 }),
);

/** The season selector's main line (ADR 0008): stored data only, so a short timeout. */
export const loadFranchise = cache(
  (slug: string): Promise<ApiResult<AnimeFranchise>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(slug)}/franchise`, {
      timeoutMs: 2_000,
      // A drifted body is an invalid_response: it only hides the selector.
      isExpectedBody: isAnimeFranchise,
    }),
);

/** The first page of a catalog list (ADR 0016): one home row. A drifted body is an invalid_response. */
export function loadAnimeList(
  kind: AnimeListKind,
): Promise<ApiResult<AnimeListPage>> {
  return apiClient().call(`/anime/lists/${kind}?limit=12`, {
    isExpectedBody: isAnimeListPage,
  });
}
