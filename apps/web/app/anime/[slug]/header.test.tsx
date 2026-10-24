import type { AnimeBySlug, AnimeDetails } from '@otakuleague/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../src/api/client';
import { loadAnime } from '../../../src/anime/data';
import { AnimeHeaderLoader } from './header';

vi.mock('../../../src/anime/data', () => ({ loadAnime: vi.fn() }));

async function renderHeader(result: ApiResult<AnimeBySlug>) {
  vi.mocked(loadAnime).mockResolvedValueOnce(result);
  render(await AnimeHeaderLoader({ slug: 'frieren' }));
  return screen.getByRole('heading', { level: 1 }).textContent;
}

const sourced = <T,>(value: T) => ({
  value,
  source: 'anilist' as const,
  fetchedAt: '2026-10-24T00:00:00.000Z',
});

describe('AnimeHeaderLoader', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadAnime).mockReset();
  });

  it('shows the anime title as the page heading', async () => {
    const anime = {
      titleEnglish: sourced('Frieren: Beyond Journey’s End'),
      titleRomaji: sourced('Sousou no Frieren'),
      titleNative: sourced('葬送のフリーレン'),
    } as unknown as AnimeDetails;

    expect(
      await renderHeader({ ok: true, data: { kind: 'anime', anime } }),
    ).toBe('Frieren: Beyond Journey’s End');
    expect(
      screen.getByText('葬送のフリーレン · Sousou no Frieren'),
    ).toBeTruthy();
  });

  it('says AniList is not answering only on an outage', async () => {
    expect(
      await renderHeader({ ok: false, failure: { kind: 'timeout' } }),
    ).toBe('This anime can’t be shown right now');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('says the anime is not available on a 404, not that AniList is down', async () => {
    expect(
      await renderHeader({
        ok: false,
        failure: {
          kind: 'api_error',
          status: 404,
          error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
        },
      }),
    ).toBe('This anime is not available');
  });

  it('links to the new address when the canonical slug moved meanwhile', async () => {
    expect(
      await renderHeader({
        ok: true,
        data: { kind: 'redirect', canonicalSlug: 'frieren-2' },
      }),
    ).toBe('This anime has moved');
    expect(
      screen
        .getByRole('link', { name: 'Go to its new address' })
        .getAttribute('href'),
    ).toBe('/anime/frieren-2');
  });
});
