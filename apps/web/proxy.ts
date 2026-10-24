import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import { apiClient } from './src/api/client';
import { createSlugProxy } from './src/anime/slug-proxy';

/** Never hold an anime page longer than this: past it the page answers on its own. */
const RESOLVE_TIMEOUT_MS = 300;

export const proxy = createSlugProxy({
  resolve: (slug) =>
    apiClient().call<AnimeSlugResolution>(
      `/anime/slugs/${encodeURIComponent(slug)}/resolve`,
      { timeoutMs: RESOLVE_TIMEOUT_MS },
    ),
});

export const config = { matcher: '/anime/:path*' };
