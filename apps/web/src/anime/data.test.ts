// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchFunction } from '../api/client';

/** The real apiClient() over a stubbed global fetch that answers 200 with `body`. */
async function loadAnimeListWith(body: unknown) {
  const urls: string[] = [];
  const fetchFunction: FetchFunction = (input) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  vi.stubEnv('API_BASE_URL', 'http://api.test:4000');
  vi.stubGlobal('fetch', fetchFunction);
  vi.resetModules();
  const { loadAnimeList } = await import('./data');
  return { loadAnimeList, urls };
}

const page = {
  kind: 'top',
  season: null,
  entries: [
    {
      anilistId: 19,
      slug: 'monster',
      titleEnglish: 'Monster',
      titleRomaji: 'MONSTER',
      coverImageUrl: null,
    },
  ],
  nextCursor: null,
  freshness: 'fresh',
  fetchedAt: '2026-11-13T00:00:00.000Z',
};

describe('loadAnimeList', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('asks for one page of the list with the given limit', async () => {
    const { loadAnimeList, urls } = await loadAnimeListWith(page);

    expect(await loadAnimeList('top', 12)).toEqual({ ok: true, data: page });
    expect(urls).toEqual(['http://api.test:4000/anime/lists/top?limit=12']);
  });

  it('maps a body the guard rejects to invalid_response', async () => {
    const { loadAnimeList } = await loadAnimeListWith({
      ...page,
      entries: [{ ...page.entries[0], slug: '../admin' }],
    });

    expect(await loadAnimeList('airing', 12)).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200 },
    });
  });
});
