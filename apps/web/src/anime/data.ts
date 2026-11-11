import {
  type AnimeBySlug,
  type AnimeFranchise,
  type AnimeSlugResolution,
  isAnimeFranchise,
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

/** The season selector's main line (ADR 0008): stored data only, so a short timeout. */
export const loadFranchise = cache(
  (slug: string): Promise<ApiResult<AnimeFranchise>> =>
    apiClient().call(`/anime/slugs/${encodeURIComponent(slug)}/franchise`, {
      timeoutMs: 2_000,
      // A drifted body is an invalid_response: it only hides the selector.
      isExpectedBody: isAnimeFranchise,
    }),
);
