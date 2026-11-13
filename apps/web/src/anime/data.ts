import {
  type AnimeBySlug,
  type AnimeDetails,
  type AnimeFranchise,
  type AnimeListKind,
  type AnimeListCardPage,
  type AnimeListSeason,
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

/** Which slice of a catalog list to ask for; season and year only go with `seasonal`. */
export interface AnimeListPageRequest {
  readonly season?: AnimeListSeason;
  readonly cursor?: string | null;
  readonly limit: number;
}

/** One page of a catalog list (ADR 0016), card fields only. A drifted body is an invalid_response. */
export function loadAnimeListPage(
  kind: AnimeListKind,
  request: AnimeListPageRequest,
): Promise<ApiResult<AnimeListCardPage>> {
  const query = new URLSearchParams();
  if (request.season !== undefined) {
    query.set('season', request.season.season);
    query.set('year', String(request.season.year));
  }
  if (request.cursor !== undefined && request.cursor !== null) {
    query.set('cursor', request.cursor);
  }
  query.set('limit', String(request.limit));
  return apiClient().call(
    `/anime/lists/${encodeURIComponent(kind)}?${query.toString()}`,
    { isExpectedBody: isAnimeListPage },
  );
}

/** The first page of a catalog list: the home rows. */
export function loadAnimeList(
  kind: AnimeListKind,
  limit: number,
): Promise<ApiResult<AnimeListCardPage>> {
  return loadAnimeListPage(kind, { limit });
}
