import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import { durationMinutes, mapJikanAnime } from './jikan.mapper';
import { record } from './parse';

function anime(name: string): Record<string, unknown> {
  return record(record(fixture(name)).data);
}

describe('mapJikanAnime', () => {
  it('maps Attack on Titan with its MyAnimeList score, rank and members', () => {
    expect(mapJikanAnime(anime('jikan-attack-on-titan'))).toMatchObject({
      ids: [{ source: 'myanimelist', externalId: 16498 }],
      sourceUrl: 'https://myanimelist.net/anime/16498/Shingeki_no_Kyojin',
      adult: false,
      titleRomaji: 'Shingeki no Kyojin',
      titleEnglish: 'Attack on Titan',
      format: 'TV',
      status: 'FINISHED',
      startDate: { year: 2013, month: 4, day: 7 },
      endDate: { year: 2013, month: 9, day: 29 },
      season: 'SPRING',
      seasonYear: 2013,
      episodes: 25,
      durationMinutes: 24,
      trailer: null,
      studios: [{ name: 'Wit Studio', main: true }],
      score: 8.57,
      scoredBy: 3010972,
      rank: 117,
      members: 4275990,
      bannerImageUrl: null,
      links: [],
      nextEpisode: null,
    });
  });

  it('maps Frieren, a show from another season and studio', () => {
    expect(mapJikanAnime(anime('jikan-frieren'))).toMatchObject({
      titleEnglish: "Frieren: Beyond Journey's End",
      season: 'FALL',
      seasonYear: 2023,
      episodes: 28,
      score: 9.25,
      rank: 1,
      studios: [{ name: 'Madhouse', main: true }],
    });
  });

  it('flags Rx (hentai) as adult, and only Rx', () => {
    const base = anime('jikan-frieren');

    expect(mapJikanAnime({ ...base, rating: 'Rx - Hentai' })?.adult).toBe(true);
    expect(mapJikanAnime({ ...base, rating: 'R+ - Mild Nudity' })?.adult).toBe(
      false,
    );
  });

  it('turns a field that changed type into null, and keeps the rest', () => {
    expect(
      mapJikanAnime({
        ...anime('jikan-frieren'),
        score: '9.25',
        type: 'Hologram',
        aired: null,
      }),
    ).toMatchObject({
      score: null,
      format: null,
      startDate: null,
      episodes: 28,
    });
  });

  it('returns null without a mal_id', () => {
    expect(mapJikanAnime({ title: 'Nothing' })).toBeNull();
  });
});

describe('durationMinutes', () => {
  it.each([
    ['24 min per ep', 24],
    ['1 hr 55 min', 115],
    ['2 hr', 120],
    ['30 sec per ep', null],
    ['Unknown', null],
    [24, null],
  ])('%j -> %j', (input, expected) => {
    expect(durationMinutes(input)).toBe(expected);
  });
});
