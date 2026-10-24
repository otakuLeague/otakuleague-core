// @vitest-environment node
import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../api/client';
import { resolveTab } from './resolve-tab';

const call = vi.fn<() => Promise<ApiResult<AnimeSlugResolution>>>();
vi.mock('../api/client', () => ({ apiClient: () => ({ call }) }));

/** What Next attaches to the error permanentRedirect / notFound throw. */
async function digestOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String((error as { digest?: unknown }).digest);
  }
  return 'no error';
}

describe('resolveTab (the page-side fallback when the proxy let a request through)', () => {
  afterEach(() => call.mockReset());

  it('redirects another slug to the canonical one with a 308, on the same tab', async () => {
    call.mockResolvedValue({
      ok: true,
      data: {
        anilistId: 101922,
        canonicalSlug: 'demon-slayer-kimetsu-no-yaiba',
      },
    });

    expect(await digestOf(resolveTab('kimetsu-no-yaiba', 'cast'))).toContain(
      ';/anime/demon-slayer-kimetsu-no-yaiba/cast;308;',
    );
    expect(await digestOf(resolveTab('kimetsu-no-yaiba', ''))).toContain(
      ';/anime/demon-slayer-kimetsu-no-yaiba;308;',
    );
  });

  it('returns the resolution for the canonical slug', async () => {
    const data = { anilistId: 16498, canonicalSlug: 'attack-on-titan' };
    call.mockResolvedValue({ ok: true, data });

    expect(await resolveTab('attack-on-titan', 'stats')).toEqual(data);
  });

  it('shows not found for a 404 or a malformed slug, and fails on an outage', async () => {
    call.mockResolvedValueOnce({
      ok: false,
      failure: {
        kind: 'api_error',
        status: 404,
        error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
      },
    });
    expect(await digestOf(resolveTab('nope', 'music'))).toContain('404');

    call.mockResolvedValueOnce({ ok: false, failure: { kind: 'network' } });
    await expect(resolveTab('attack-on-titan', 'music')).rejects.toThrow(
      'Could not resolve anime slug (network)',
    );
  });
});
