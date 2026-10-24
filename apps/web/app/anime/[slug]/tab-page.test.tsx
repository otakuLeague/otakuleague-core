// @vitest-environment node
import type { AnimeDetails } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAnime, resolveAnimeSlug } from '../../../src/anime/data';
import { tabMetadata } from './tab-page';

vi.mock('../../../src/anime/data', () => ({
  resolveAnimeSlug: vi.fn(),
  loadAnime: vi.fn(),
}));

const sourced = (value: string) => ({ value, source: 'anilist' });
// Only the fields metadata reads; the rest of AnimeDetails is irrelevant here.
const frieren = {
  titleEnglish: null,
  titleRomaji: sourced('Sousou no Frieren'),
  titleNative: sourced('葬送のフリーレン'),
  synopsis: sourced('An elf mage outlives her party.\n\nSecond paragraph.'),
  coverImageUrl: sourced('https://img.example/frieren.jpg'),
} as unknown as AnimeDetails;
const params = (slug: string) => Promise.resolve({ slug });

describe('tabMetadata', () => {
  afterEach(() => vi.resetAllMocks());

  it('titles each tab after the anime, with the first synopsis paragraph, cover and canonical URL', async () => {
    vi.mocked(resolveAnimeSlug).mockResolvedValue({
      ok: true,
      data: { anilistId: 154587, canonicalSlug: 'frieren' },
    });
    vi.mocked(loadAnime).mockResolvedValue({
      ok: true,
      data: { kind: 'anime', anime: frieren },
    });

    const overview = await tabMetadata(params('frieren'), '');
    expect(overview.title).toBe('Sousou no Frieren');
    expect(overview.description).toBe('An elf mage outlives her party.');
    expect(overview.alternates?.canonical).toBe('/anime/frieren');
    expect(overview.openGraph?.images).toEqual([
      'https://img.example/frieren.jpg',
    ]);

    const cast = await tabMetadata(params('frieren'), 'cast');
    expect(cast.title).toBe('Sousou no Frieren · Cast & Crew');
    expect(cast.alternates?.canonical).toBe('/anime/frieren/cast');
    expect(loadAnime).toHaveBeenCalledWith('frieren');
  });

  it('titles a slug no anime has "Anime not found"', async () => {
    vi.mocked(resolveAnimeSlug).mockResolvedValue({
      ok: false,
      failure: {
        kind: 'api_error',
        status: 404,
        error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
      },
    });

    expect((await tabMetadata(params('nope'), '')).title).toBe(
      'Anime not found',
    );
    expect(loadAnime).not.toHaveBeenCalled();
  });

  it('starts no import for a slug that is being redirected', async () => {
    vi.mocked(resolveAnimeSlug).mockResolvedValue({
      ok: true,
      data: { anilistId: 154587, canonicalSlug: 'frieren' },
    });

    expect((await tabMetadata(params('sousou-no-frieren'), 'cast')).title).toBe(
      'Cast & Crew',
    );
    expect(loadAnime).not.toHaveBeenCalled();
  });

  it('keeps a neutral title when the API is down, never "Anime not found"', async () => {
    vi.mocked(resolveAnimeSlug).mockResolvedValue({
      ok: false,
      failure: { kind: 'timeout' },
    });

    expect((await tabMetadata(params('frieren'), 'cast')).title).toBe(
      'Cast & Crew',
    );
  });
});
