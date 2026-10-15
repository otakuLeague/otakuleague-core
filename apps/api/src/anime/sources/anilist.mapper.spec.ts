import { describe, expect, it } from 'vitest';
import { mapAniListMedia } from './anilist.mapper';
import { fixture } from './fixtures';
import { record } from './parse';

function media(name: string): Record<string, unknown> {
  return record(record(record(fixture(name)).data).Media);
}

describe('mapAniListMedia', () => {
  it('maps Attack on Titan, trimming the tab AniList puts after the trailer id', () => {
    const snapshot = mapAniListMedia(media('anilist-attack-on-titan'));

    expect(snapshot).toMatchObject({
      ids: [
        { source: 'anilist', externalId: 16498 },
        { source: 'myanimelist', externalId: 16498 },
      ],
      sourceUrl: 'https://anilist.co/anime/16498',
      adult: false,
      titleRomaji: 'Shingeki no Kyojin',
      titleEnglish: 'Attack on Titan',
      titleNative: '進撃の巨人',
      format: 'TV',
      status: 'FINISHED',
      startDate: { year: 2013, month: 4, day: 7 },
      season: 'SPRING',
      seasonYear: 2013,
      episodes: 25,
      durationMinutes: 24,
      trailer: { site: 'youtube', id: 'LHtdKWJdif4' },
      nextEpisode: null,
    });
    expect(snapshot?.studios).toContainEqual({
      name: 'WIT STUDIO',
      main: true,
    });
    expect(
      snapshot?.studios.filter((studio) => !studio.main).length,
    ).toBeGreaterThan(0);
    expect(snapshot?.links).toContainEqual(
      expect.objectContaining({ site: 'Crunchyroll', kind: 'streaming' }),
    );
    expect(snapshot?.links).toContainEqual(
      expect.objectContaining({ site: 'Official Site', kind: 'other' }),
    );
    expect(snapshot?.tags.length).toBeGreaterThan(0);
    expect(snapshot?.tags.some((tag) => tag.spoiler)).toBe(true);
    expect(snapshot?.score).toBe(85);
  });

  it('turns the HTML description into plain text', () => {
    const raw = media('anilist-attack-on-titan');
    const synopsis = mapAniListMedia(raw)?.synopsis ?? '';

    expect(String(raw.description)).toMatch(/<br\s*\/?>/);
    expect(synopsis).not.toMatch(/[<>]/);
    expect(synopsis).toContain('\n\n');
  });

  it('keeps a missing English title as null (Minami-ke has none)', () => {
    const snapshot = mapAniListMedia(media('anilist-minami-ke'));

    expect(snapshot?.titleEnglish).toBeNull();
    expect(snapshot?.titleRomaji).toBe('Minami-ke');
  });

  it('maps the next airing episode of an airing show to a date', () => {
    const snapshot = mapAniListMedia(media('anilist-one-piece'));

    expect(snapshot?.status).toBe('RELEASING');
    expect(snapshot?.nextEpisode).toEqual({
      episode: 1181,
      airingAt: new Date(1798985760 * 1000),
    });
  });

  it('returns null when there is no media (unknown id)', () => {
    expect(
      mapAniListMedia(record(record(fixture('anilist-not-found')).data).Media),
    ).toBeNull();
  });

  it('turns a field that changed type into null or empty, and keeps the rest', () => {
    const raw = {
      ...media('anilist-frieren'),
      episodes: '28',
      format: 'HOLOGRAM',
      tags: 'not a list',
      startDate: { year: 'soon' },
      trailer: { id: '   ', site: 'youtube' },
      externalLinks: [
        { site: 'Bad', url: 'javascript:alert(1)', type: 'STREAMING' },
      ],
    };

    expect(mapAniListMedia(raw)).toMatchObject({
      episodes: null,
      format: null,
      tags: [],
      startDate: null,
      trailer: null,
      links: [],
      titleRomaji: 'Sousou no Frieren',
    });
  });

  it('flags adult entries', () => {
    expect(
      mapAniListMedia({ ...media('anilist-frieren'), isAdult: true })?.adult,
    ).toBe(true);
  });
});
