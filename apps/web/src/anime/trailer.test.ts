import type { AnimeTrailer } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import { TRAILER_EMBED_ORIGINS, trailerOf } from './trailer';

const withTrailer = (trailer: AnimeTrailer, overrides = {}) =>
  trailerOf(animeFixture({ trailer: sourced(trailer), ...overrides }));

const BANNER =
  'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498.jpg';
const COVER =
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg';

describe('trailerOf', () => {
  it('is null without a trailer', () => {
    expect(trailerOf(animeFixture())).toBeNull();
  });

  it('builds the privacy-enhanced YouTube embed and the watch link', () => {
    expect(withTrailer({ site: 'youtube', id: 'LHtdKWJdif4' })).toEqual({
      siteLabel: 'YouTube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/LHtdKWJdif4?autoplay=1',
      watchUrl: 'https://www.youtube.com/watch?v=LHtdKWJdif4',
      poster: { kind: 'image', url: BANNER },
    });
    expect(withTrailer({ site: 'youtube', id: 'a_b-c_d-e_f' })).not.toBeNull();
  });

  it('builds the Dailymotion embed and the watch link', () => {
    expect(withTrailer({ site: 'dailymotion', id: 'x7tgad0' })).toMatchObject({
      siteLabel: 'Dailymotion',
      embedUrl: 'https://www.dailymotion.com/embed/video/x7tgad0?autoplay=1',
      watchUrl: 'https://www.dailymotion.com/video/x7tgad0',
    });
    expect(
      withTrailer({ site: 'dailymotion', id: 'a'.repeat(32) }),
    ).not.toBeNull();
  });

  it.each([
    '',
    'LHtdKWJdif',
    'LHtdKWJdif45',
    'LHtdKWJdi"4',
    'LHtdKWJ/if4',
    'LHtdKWJ?if4',
    'LHtdKWJdif4\n',
  ])('refuses the YouTube id %j', (id) => {
    expect(withTrailer({ site: 'youtube', id })).toBeNull();
  });

  it.each(['', 'a'.repeat(33), 'x7t_ad0', 'x7t-ad0', 'x7"', 'x7/a', 'x7?a'])(
    'refuses the Dailymotion id %j',
    (id) => {
      expect(withTrailer({ site: 'dailymotion', id })).toBeNull();
    },
  );

  it.each([
    { site: 'vimeo', id: 'LHtdKWJdif4' },
    { id: 'LHtdKWJdif4' },
    { site: { name: 'youtube' }, id: 'LHtdKWJdif4' },
    { site: 'youtube', id: ['LHtdKWJdif4'] },
    { site: 'youtube' },
  ])('fails closed on an unexpected shape %j', (trailer) => {
    // Cast on purpose: the API could change shape before the shared type does.
    expect(withTrailer(trailer as unknown as AnimeTrailer)).toBeNull();
  });

  it('falls back from the banner to an https cover, then to a placeholder', () => {
    const trailer: AnimeTrailer = { site: 'youtube', id: 'LHtdKWJdif4' };
    expect(withTrailer(trailer, { bannerImageUrl: null })?.poster).toEqual({
      kind: 'image',
      url: COVER,
    });
    expect(
      withTrailer(trailer, {
        bannerImageUrl: sourced('http://insecure.example/banner.jpg'),
      })?.poster,
    ).toEqual({ kind: 'image', url: COVER });
    expect(
      withTrailer(trailer, { bannerImageUrl: null, coverImageUrl: null })
        ?.poster,
    ).toEqual({ kind: 'placeholder' });
    expect(
      withTrailer(trailer, {
        bannerImageUrl: sourced('javascript:alert(1)'),
        coverImageUrl: sourced('//cdn.example/cover.jpg'),
      })?.poster,
    ).toEqual({ kind: 'placeholder' });
  });

  it('only ever embeds from the declared origins', () => {
    const youtube = withTrailer({ site: 'youtube', id: 'LHtdKWJdif4' });
    const dailymotion = withTrailer({ site: 'dailymotion', id: 'x7tgad0' });
    for (const trailer of [youtube, dailymotion]) {
      const origin = new URL(trailer?.embedUrl ?? '').origin;
      expect(TRAILER_EMBED_ORIGINS).toContain(origin);
    }
  });
});
