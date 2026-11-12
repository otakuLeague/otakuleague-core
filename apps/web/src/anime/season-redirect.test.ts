// @vitest-environment node
import type { AnimeDetails } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../api/client';
import { animeFixture } from './fixtures';
import { seasonRedirect } from './season-redirect';

const call = vi.fn<() => Promise<ApiResult<AnimeDetails>>>();
vi.mock('../api/client', () => ({ apiClient: () => ({ call }) }));

/** What Next attaches to the error redirect / notFound throw. */
async function digestOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String((error as { digest?: unknown }).digest);
  }
  return 'no error';
}

const apiError = (status: number): ApiResult<AnimeDetails> => ({
  ok: false,
  failure: {
    kind: 'api_error',
    status,
    error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
  },
});
const season2 = animeFixture({ canonicalSlug: 'attack-on-titan-season-2' });

describe('seasonRedirect (the season selector link to a season not imported yet)', () => {
  afterEach(() => call.mockReset());

  it('imports the anime, then redirects to its canonical slug with a 307, on the same tab', async () => {
    call.mockResolvedValue({ ok: true, data: season2 });

    expect(await digestOf(seasonRedirect('20958', ['episodes']))).toContain(
      ';/anime/attack-on-titan-season-2/episodes;307;',
    );
    expect(call).toHaveBeenCalledWith('/anime/anilist/20958', {
      timeoutMs: 15_000,
    });
  });

  it('redirects to the bare slug without a tab', async () => {
    call.mockResolvedValue({ ok: true, data: season2 });

    expect(await digestOf(seasonRedirect('20958', undefined))).toContain(
      ';/anime/attack-on-titan-season-2;307;',
    );
    expect(await digestOf(seasonRedirect('20958', []))).toContain(
      ';/anime/attack-on-titan-season-2;307;',
    );
  });

  it('shows not found for a malformed id or tab, without calling the API', async () => {
    for (const id of ['0', '01', 'abc', '1234567890', '-5', '']) {
      expect(await digestOf(seasonRedirect(id, undefined))).toContain('404');
    }
    for (const tab of [['nope'], ['cast', 'x'], ['']]) {
      expect(await digestOf(seasonRedirect('20958', tab))).toContain('404');
    }
    expect(call).not.toHaveBeenCalled();
  });

  it('shows not found when no source knows the id, it is adult, or it has no slug', async () => {
    call.mockResolvedValueOnce(apiError(404));
    expect(await digestOf(seasonRedirect('20958', ['cast']))).toContain('404');

    call.mockResolvedValueOnce(apiError(400));
    expect(await digestOf(seasonRedirect('20958', ['cast']))).toContain('404');

    call.mockResolvedValueOnce({
      ok: true,
      data: animeFixture({ canonicalSlug: null }),
    });
    expect(await digestOf(seasonRedirect('20958', ['cast']))).toContain('404');
  });

  it('fails (the error page) on a slug the API should never send', async () => {
    for (const canonicalSlug of ['../x', '', 'Attack-On-Titan', 'a--b']) {
      call.mockResolvedValueOnce({
        ok: true,
        data: animeFixture({ canonicalSlug }),
      });
      await expect(seasonRedirect('20958', ['cast'])).rejects.toThrow(
        'Unexpected anime slug from the API',
      );
    }
  });

  it('fails (the error page) when the sources are down or the import is too slow', async () => {
    call.mockResolvedValueOnce(apiError(503));
    await expect(seasonRedirect('20958', undefined)).rejects.toThrow(
      'Could not load anime by AniList id (api_error)',
    );

    call.mockResolvedValueOnce({ ok: false, failure: { kind: 'timeout' } });
    await expect(seasonRedirect('20958', undefined)).rejects.toThrow(
      'Could not load anime by AniList id (timeout)',
    );
  });
});
