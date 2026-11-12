// @vitest-environment node
import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../api/client';
import { ANIME_NOT_FOUND_PATH, createSlugProxy } from './slug-proxy';

const found = (canonicalSlug: string): ApiResult<AnimeSlugResolution> => ({
  ok: true,
  data: { anilistId: 16498, canonicalSlug },
});
const missing: ApiResult<AnimeSlugResolution> = {
  ok: false,
  failure: {
    kind: 'api_error',
    status: 404,
    error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
  },
};

function setUp(answer: (slug: string) => ApiResult<AnimeSlugResolution>) {
  let time = 0;
  const resolve = vi.fn((slug: string) => Promise.resolve(answer(slug)));
  const proxy = createSlugProxy({ resolve, now: () => time });
  const visit = (path: string) =>
    proxy(new NextRequest(new URL(path, 'http://localhost:3000')));
  return {
    resolve,
    visit,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const location = (response: Response) => response.headers.get('location');
const rewrittenTo = (response: Response) =>
  response.headers.get('x-middleware-rewrite');

describe('anime slug proxy', () => {
  it('sends another slug of the anime to its canonical slug with a 308, on the same tab', async () => {
    const { visit } = setUp(() => found('attack-on-titan'));

    for (const [path, target] of [
      ['/anime/shingeki-no-kyojin/cast', '/anime/attack-on-titan/cast'],
      ['/anime/shingeki-no-kyojin/episodes', '/anime/attack-on-titan/episodes'],
      ['/anime/shingeki-no-kyojin', '/anime/attack-on-titan'],
    ] as const) {
      const response = await visit(path);
      expect(response.status).toBe(308);
      expect(location(response)).toBe(`http://localhost:3000${target}`);
    }
  });

  it('redirects another letter case and keeps the query string', async () => {
    const { visit } = setUp(() => found('attack-on-titan'));

    const response = await visit('/anime/Attack-On-Titan/stats?from=search');

    expect(response.status).toBe(308);
    expect(location(response)).toBe(
      'http://localhost:3000/anime/attack-on-titan/stats?from=search',
    );
  });

  it('rewrites a slug no anime has to the not-found page', async () => {
    const { visit } = setUp(() => missing);

    const response = await visit('/anime/no-such-anime/music');

    // The 404 status comes from the rewritten page (it calls notFound()); checked by curl.
    expect(rewrittenTo(response)).toBe(
      `http://localhost:3000${ANIME_NOT_FOUND_PATH}`,
    );
  });

  it('lets the canonical slug through, a purged anime included (resolve reads the database only)', async () => {
    const { visit } = setUp(() => found('attack-on-titan'));

    const response = await visit('/anime/attack-on-titan/cast');

    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(rewrittenTo(response)).toBeNull();
  });

  it('lets the request through when the API is down or too slow, and asks again next time', async () => {
    const { visit, resolve } = setUp(() => ({
      ok: false,
      failure: { kind: 'timeout' },
    }));

    expect((await visit('/anime/shingeki-no-kyojin/cast')).status).toBe(200);
    expect((await visit('/anime/shingeki-no-kyojin/cast')).status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('remembers an answer for about a minute, any letter case', async () => {
    const { visit, resolve, advance } = setUp(() => found('attack-on-titan'));

    await visit('/anime/shingeki-no-kyojin/cast');
    await visit('/anime/Shingeki-No-Kyojin/stats');
    expect(resolve).toHaveBeenCalledTimes(1);

    advance(60_001);
    await visit('/anime/shingeki-no-kyojin/cast');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('forgets a miss after 10 s, sooner than a found slug, and treats a 400 as a miss', async () => {
    const badRequest: ApiResult<AnimeSlugResolution> = {
      ok: false,
      failure: {
        kind: 'api_error',
        status: 400,
        error: { error: { code: 'BAD_REQUEST', message: 'Bad slug.' } },
      },
    };
    const { visit, resolve, advance } = setUp(() => badRequest);

    expect(rewrittenTo(await visit('/anime/bad..slug'))).toContain(
      ANIME_NOT_FOUND_PATH,
    );
    advance(9_999);
    await visit('/anime/bad..slug');
    expect(resolve).toHaveBeenCalledTimes(1);
    advance(1);
    await visit('/anime/bad..slug');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('decodes a percent-encoded slug and does not loop on its own redirect target', async () => {
    const { visit, resolve } = setUp(() => found('進撃の巨人'));

    const response = await visit('/anime/SHINGEKI');
    const target = location(response) ?? '';
    expect(target).toBe(
      `http://localhost:3000/anime/${encodeURIComponent('進撃の巨人')}`,
    );

    const followed = await visit(new URL(target).pathname);
    expect(followed.status).toBe(200);
    expect(resolve).toHaveBeenLastCalledWith('進撃の巨人');
  });

  it('ignores paths that are not an anime page', async () => {
    const { visit, resolve } = setUp(() => missing);

    expect((await visit('/anime/a/b/c')).status).toBe(200);
    expect((await visit('/anime/alias/not-a-tab')).status).toBe(200);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets the AniList id route through without resolving anything', async () => {
    const { visit, resolve } = setUp(() => missing);

    for (const path of [
      '/anime/anilist/20958',
      '/anime/anilist/20958/episodes',
    ]) {
      const response = await visit(path);
      expect(response.status).toBe(200);
      expect(location(response)).toBeNull();
      expect(rewrittenTo(response)).toBeNull();
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('handles a trailing slash like the bare path', async () => {
    const { visit } = setUp(() => found('attack-on-titan'));

    const response = await visit('/anime/shingeki-no-kyojin/cast/');

    expect(response.status).toBe(308);
    expect(location(response)).toBe(
      'http://localhost:3000/anime/attack-on-titan/cast',
    );
  });

  it('shares one resolve between simultaneous requests for the same slug', async () => {
    let answer: (result: ApiResult<AnimeSlugResolution>) => void = () => {};
    const resolve = vi.fn(
      () =>
        new Promise<ApiResult<AnimeSlugResolution>>((settle) => {
          answer = settle;
        }),
    );
    const proxy = createSlugProxy({ resolve, now: () => 0 });
    const visit = (path: string) =>
      proxy(new NextRequest(new URL(path, 'http://localhost:3000')));

    const both = Promise.all([
      visit('/anime/shingeki-no-kyojin/cast'),
      visit('/anime/Shingeki-No-Kyojin/stats'),
    ]);
    answer(found('attack-on-titan'));
    const responses = await both;

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(responses.map((response) => response.status)).toEqual([308, 308]);
  });
});
