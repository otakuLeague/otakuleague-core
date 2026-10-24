// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import { countdown, headerFacts } from './header-facts';

describe('headerFacts', () => {
  it('derives every header value from a complete anime', () => {
    expect(headerFacts(animeFixture())).toEqual({
      title: 'Attack on Titan',
      subtitle: '進撃の巨人 · Shingeki no Kyojin',
      initials: 'AT',
      coverUrl:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg',
      creators: ['Hajime Isayama'],
      studios: ['Wit Studio'],
      status: { key: 'finished', label: 'Finished' },
      format: 'TV',
      season: { key: 'spring', label: 'Spring 2013' },
      runtime: '25 eps · 24m',
      episodes: '25 eps',
      score: 85,
      members: '812.3K',
      favourites: '110.4K',
      rankRated: '#69 highest rated TV',
      rankPopular: '#1 most popular TV',
      ranksShort: '#69 · #1',
      nextEpisode: null,
    });
  });

  it.each([
    ['RELEASING', 'airing', 'Airing'],
    ['FINISHED', 'finished', 'Finished'],
    ['NOT_YET_RELEASED', 'upcoming', 'Not yet aired'],
    ['HIATUS', 'hiatus', 'On hiatus'],
    ['CANCELLED', 'cancelled', 'Cancelled'],
  ] as const)('labels the %s status', (status, key, label) => {
    expect(
      headerFacts(animeFixture({ status: sourced(status) })).status,
    ).toEqual({ key, label });
  });

  it('hides whatever AniList does not give, never showing 0 or #null', () => {
    const facts = headerFacts(
      animeFixture({
        titleEnglish: null,
        titleNative: null,
        coverImageUrl: null,
        bannerImageUrl: null,
        creators: null,
        studios: sourced([{ name: 'Pony Canyon', main: false }]),
        status: null,
        format: null,
        season: null,
        episodes: sourced(0),
        durationMinutes: null,
        favourites: sourced(0),
        rankRated: null,
        rankPopular: sourced(0),
        scores: [],
      }),
    );
    expect(facts).toMatchObject({
      title: 'Shingeki no Kyojin',
      subtitle: null,
      coverUrl: null,
      creators: [],
      studios: [],
      status: null,
      format: null,
      season: null,
      runtime: null,
      score: null,
      members: null,
      favourites: null,
      rankRated: null,
      rankPopular: null,
      ranksShort: null,
      episodes: null,
    });
  });

  it('drops the format from a rank when the format is unknown', () => {
    expect(headerFacts(animeFixture({ format: null })).rankRated).toBe(
      '#69 highest rated',
    );
  });

  it('formats a single episode and long durations', () => {
    expect(
      headerFacts(
        animeFixture({ episodes: sourced(1), durationMinutes: sourced(130) }),
      ).runtime,
    ).toBe('1 ep · 2h 10m');
    expect(
      headerFacts(
        animeFixture({ episodes: null, durationMinutes: sourced(120) }),
      ).runtime,
    ).toBe('2h');
  });

  it('shows the season without a year when the year is missing', () => {
    expect(headerFacts(animeFixture({ seasonYear: null })).season).toEqual({
      key: 'spring',
      label: 'Spring',
    });
  });

  it('builds initials for the cover placeholder', () => {
    const initials = (title: string) =>
      headerFacts(animeFixture({ titleEnglish: sourced(title) })).initials;
    expect(initials('Frieren: Beyond Journey’s End')).toBe('FE');
    expect(initials('Monster')).toBe('M');
    expect(initials('進撃の巨人')).toBe('進');
  });

  it('gives the next episode only while airing', () => {
    const next = sourced({ episode: 8, airingAt: '2026-10-26T15:00:00.000Z' });
    expect(
      headerFacts(
        animeFixture({ status: sourced('RELEASING'), nextEpisode: next }),
      ).nextEpisode,
    ).toEqual(next.value);
    expect(
      headerFacts(
        animeFixture({ status: sourced('HIATUS'), nextEpisode: next }),
      ).nextEpisode,
    ).toBeNull();
  });
});

describe('headerFacts credits and counts', () => {
  it('gives no creators both for an empty list and for a missing one', () => {
    expect(
      headerFacts(animeFixture({ creators: sourced([]) })).creators,
    ).toEqual([]);
    expect(headerFacts(animeFixture({ creators: null })).creators).toEqual([]);
  });

  it('keeps every main studio in AniList order and drops the others', () => {
    expect(
      headerFacts(
        animeFixture({
          studios: sourced([
            { name: 'MAPPA', main: true },
            { name: 'Pony Canyon', main: false },
            { name: 'Wit Studio', main: true },
          ]),
        }),
      ).studios,
    ).toEqual(['MAPPA', 'Wit Studio']);
  });

  it.each([
    [1, '1'],
    [999, '999'],
    [1000, '1K'],
    [1050, '1.1K'],
    [999_949, '999.9K'],
    [999_950, '1M'],
    [1_000_000, '1M'],
    [2_000_000_000, '2B'],
  ])('writes %d favourites as "%s"', (count, shown) => {
    expect(
      headerFacts(animeFixture({ favourites: sourced(count) })).favourites,
    ).toBe(shown);
  });

  it('hides nonsense counts and ranks instead of showing NaN or a negative', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const facts = headerFacts(
        animeFixture({
          favourites: sourced(bad),
          rankRated: sourced(bad),
          rankPopular: sourced(bad),
          episodes: sourced(bad),
          durationMinutes: sourced(bad),
          scores: [
            {
              source: 'anilist',
              fetchedAt: '2026-10-24T00:00:00.000Z',
              score: bad,
              scale: 100,
              scoredBy: null,
              rank: null,
              members: bad,
            },
          ],
        }),
      );
      expect(facts).toMatchObject({
        favourites: null,
        rankRated: null,
        rankPopular: null,
        ranksShort: null,
        episodes: null,
        runtime: null,
        score: null,
        members: null,
      });
    }
  });

  it('shows one rank alone in the short form', () => {
    expect(headerFacts(animeFixture({ rankRated: null })).ranksShort).toBe(
      '#1',
    );
  });

  it('subtitles a romaji title with the native one only', () => {
    expect(headerFacts(animeFixture({ titleEnglish: null })).subtitle).toBe(
      '進撃の巨人',
    );
  });

  it('gives no next episode while airing when none is scheduled', () => {
    expect(
      headerFacts(
        animeFixture({ status: sourced('RELEASING'), nextEpisode: null }),
      ).nextEpisode,
    ).toBeNull();
  });
});

it('drops a next episode whose date cannot be parsed, so it never reads "aired"', () => {
  expect(
    headerFacts(
      animeFixture({
        status: sourced('RELEASING'),
        nextEpisode: sourced({ episode: 8, airingAt: 'not a date' }),
      }),
    ).nextEpisode,
  ).toBeNull();
});

describe('countdown', () => {
  const airingAt = '2026-10-26T15:00:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('counts days, hours, minutes and seconds', () => {
    expect(countdown(airingAt, at('2026-10-24T00:36:25.000Z'))).toBe(
      '2d 14h 23m 35s',
    );
    expect(countdown(airingAt, at('2026-10-26T14:54:55.000Z'))).toBe('05m 05s');
    expect(countdown(airingAt, at('2026-10-26T13:00:00.000Z'))).toBe(
      '2h 00m 00s',
    );
  });

  it('is null at zero and after', () => {
    expect(countdown(airingAt, at(airingAt))).toBeNull();
    expect(countdown(airingAt, at('2026-10-26T15:00:01.000Z'))).toBeNull();
    expect(countdown(airingAt, at('2026-10-26T14:59:59.000Z'))).toBe('00m 01s');
  });

  it('shows the hours once a full hour is left, and the days once a full day is', () => {
    expect(countdown(airingAt, at('2026-10-26T14:00:01.000Z'))).toBe('59m 59s');
    expect(countdown(airingAt, at('2026-10-26T14:00:00.000Z'))).toBe(
      '1h 00m 00s',
    );
    expect(countdown(airingAt, at('2026-10-25T15:00:01.000Z'))).toBe(
      '23h 59m 59s',
    );
    expect(countdown(airingAt, at('2026-10-25T15:00:00.000Z'))).toBe(
      '1d 0h 00m 00s',
    );
  });

  it('counts under a second left as aired', () => {
    expect(countdown(airingAt, at('2026-10-26T14:59:59.001Z'))).toBeNull();
  });

  it('is null for an airing time it cannot parse', () => {
    expect(countdown('not a date', at(airingAt))).toBeNull();
    expect(countdown('', at(airingAt))).toBeNull();
  });
});
