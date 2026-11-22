import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import {
  durationOf,
  informationRows,
  overviewFacts,
  synopsisOf,
} from './overview-facts';

describe('synopsisOf', () => {
  it('is null for a missing or blank synopsis', () => {
    expect(synopsisOf(undefined)).toBeNull();
    expect(synopsisOf('  \n\n ')).toBeNull();
    expect(synopsisOf('(Source: Crunchyroll)')).toBeNull();
  });

  it('splits paragraphs on blank lines and turns a trailing source into a note', () => {
    expect(
      synopsisOf('First.\n\n  Second line\nwraps.  \n\n(Source: Crunchyroll)'),
    ).toEqual({
      paragraphs: ['First.', 'Second line\nwraps.'],
      source: 'Crunchyroll',
      collapse: 'paragraph',
    });
    expect(synopsisOf('One paragraph. (Source:  ANN )')?.source).toBe('ANN');
    expect(synopsisOf('Text. (Source: )')).toEqual({
      paragraphs: ['Text.'],
      source: null,
      collapse: 'none',
    });
  });

  it('clamps only a first paragraph over 350 characters, never at exactly 350', () => {
    expect(synopsisOf('a'.repeat(350))?.collapse).toBe('none');
    expect(synopsisOf('a'.repeat(351))?.collapse).toBe('clamp');
    expect(synopsisOf(`${'a'.repeat(351)}\n\nB.`)?.collapse).toBe('clamp');
    expect(synopsisOf('Short.\n\nMore.')?.collapse).toBe('paragraph');
  });

  it('parses a hostile unclosed source note in linear time', () => {
    const text = `Notes${' '.repeat(150)}(Source:${' '.repeat(450)}tbd`;
    const started = performance.now();
    const synopsis = synopsisOf(text);
    expect(performance.now() - started).toBeLessThan(50);
    expect(synopsis?.source).toBeNull();
    expect(synopsis?.paragraphs).toEqual([text]);
  });

  it('caps the synopsis at 20,000 characters', () => {
    const synopsis = synopsisOf('a'.repeat(30_000));
    expect(synopsis?.paragraphs[0]).toHaveLength(20_000);
  });
});

describe('overviewFacts', () => {
  it('reads format, season and main studio from the header facts', () => {
    const facts = overviewFacts(animeFixture());
    expect(facts.format).toBe('TV');
    expect(facts.season).toBe('Spring 2013');
    expect(facts.studios).toEqual(['Wit Studio']);
    expect(facts.themes.genres).toEqual(['Action', 'Drama']);
    expect(facts.episodes).toBe('25');
    expect(facts.duration).toBe('24 min per ep');
    expect(facts.status).toBe('Finished');
    expect(facts.creators).toEqual(['Hajime Isayama']);
    expect(facts.title).toBe('Attack on Titan');
    expect(facts.trailer).toBeNull();
  });

  it('shows a range, a single date, or year and year-month precision', () => {
    expect(overviewFacts(animeFixture()).aired).toEqual({
      kind: 'range',
      start: { datetime: '2013-04-07', label: '7 Apr 2013' },
      end: { datetime: '2013-09-29', label: '29 Sep 2013' },
    });
    const movie = animeFixture({
      startDate: sourced({ year: 2020, month: 10, day: 16 }),
      endDate: sourced({ year: 2020, month: 10, day: 16 }),
    });
    expect(overviewFacts(movie).aired).toEqual({
      kind: 'single',
      start: { datetime: '2020-10-16', label: '16 Oct 2020' },
    });
    const vague = animeFixture({
      startDate: sourced({ year: 2027, month: null, day: null }),
      endDate: sourced({ year: 2027, month: 3, day: null }),
    });
    expect(overviewFacts(vague).aired).toEqual({
      kind: 'range',
      start: { datetime: '2027', label: '2027' },
      end: { datetime: '2027-03', label: 'Mar 2027' },
    });
    expect(overviewFacts(animeFixture({ startDate: null })).aired).toBeNull();
  });

  it('while airing without a total: episodes so far and an open end', () => {
    const facts = overviewFacts(
      animeFixture({
        status: sourced('RELEASING'),
        episodes: null,
        nextEpisode: sourced({
          episode: 1181,
          airingAt: '2026-11-15T00:00:00Z',
        }),
      }),
    );
    expect(facts.episodes).toBe('1180 so far');
    expect(facts.aired?.kind).toBe('airing');
    // Before the first episode airs there is nothing to count.
    const upcoming = animeFixture({
      status: sourced('RELEASING'),
      episodes: null,
      nextEpisode: sourced({ episode: 1, airingAt: '2026-11-15T00:00:00Z' }),
    });
    expect(overviewFacts(upcoming).episodes).toBeNull();
  });

  it('keeps a planned end date for a not yet released anime', () => {
    const facts = overviewFacts(
      animeFixture({
        status: sourced('NOT_YET_RELEASED'),
        startDate: sourced({ year: 2027, month: 1, day: 9 }),
        endDate: sourced({ year: 2027, month: 3, day: 27 }),
      }),
    );
    expect(facts.aired?.kind).toBe('range');
    expect(facts.status).toBe('Not yet aired');
  });

  it('drops impossible days and years, and an end before the start', () => {
    const date = (year: number, month: number, day: number) =>
      overviewFacts(
        animeFixture({
          startDate: sourced({ year, month, day }),
          endDate: null,
        }),
      ).aired?.start.datetime;
    expect(date(2023, 2, 30)).toBe('2023-02');
    expect(date(2024, 2, 29)).toBe('2024-02-29');
    expect(date(1899, 5, 1)).toBeUndefined();
    expect(date(2101, 5, 1)).toBeUndefined();
    const backwards = animeFixture({
      startDate: sourced({ year: 2013, month: 4, day: 7 }),
      endDate: sourced({ year: 2012, month: 1, day: 1 }),
    });
    expect(overviewFacts(backwards).aired?.kind).toBe('single');
  });

  it('bounds genres and studios from the source', () => {
    const facts = overviewFacts(
      animeFixture({
        genres: sourced([
          ' Action ',
          'Action',
          ...Array.from({ length: 30 }, (_, i) => `G${i}`),
        ]),
        studios: sourced(
          Array.from({ length: 15 }, (_, i) => ({ name: `S${i}`, main: true })),
        ),
      }),
    );
    expect(facts.themes.genres).toHaveLength(20);
    expect(facts.themes.genres.slice(0, 2)).toEqual(['Action', 'G0']);
    expect(facts.studios).toHaveLength(10);
  });

  it('hides a synopsis from a source not cleared for display (OTA-127)', () => {
    const jikan = animeFixture({
      synopsis: { ...sourced('From MyAnimeList.'), source: 'jikan' },
    });
    expect(overviewFacts(jikan).synopsis).toBeNull();
  });

  it('hides what AniList lacks or sends as nonsense', () => {
    const facts = overviewFacts(
      animeFixture({
        format: null,
        episodes: sourced(0),
        durationMinutes: null,
        startDate: sourced({ year: 0, month: 13, day: 40 }),
        season: null,
        studios: sourced([{ name: 'Pony Canyon', main: false }]),
        genres: sourced(['', ' ']),
        synopsis: null,
      }),
    );
    expect(facts).toEqual({
      title: 'Attack on Titan',
      trailer: null,
      synopsis: null,
      format: null,
      episodes: null,
      duration: null,
      status: 'Finished',
      aired: null,
      season: null,
      studios: [],
      creators: ['Hajime Isayama'],
      themes: { genres: [], tags: [] },
      altTitles: [
        { kind: 'romaji', text: 'Shingeki no Kyojin' },
        { kind: 'native', text: '進撃の巨人' },
      ],
      links: [],
    });
  });
});

describe('durationOf', () => {
  const duration = (minutes: number | null, overrides = {}) =>
    durationOf(
      animeFixture({
        durationMinutes: minutes === null ? null : sourced(minutes),
        ...overrides,
      }),
    );

  it('reads per episode for a series', () => {
    expect(duration(24)).toBe('24 min per ep');
    expect(duration(3, { episodes: null })).toBe('3 min per ep');
  });

  it('reads the whole runtime of a movie or a single episode', () => {
    const movie = { format: sourced('MOVIE' as const), episodes: null };
    expect(duration(107, movie)).toBe('1 h 47 min');
    expect(duration(120, movie)).toBe('2 h');
    expect(duration(45, movie)).toBe('45 min');
    expect(duration(60, { episodes: sourced(1) })).toBe('1 h');
    expect(duration(1440, { episodes: sourced(1) })).toBe('24 h');
    // A movie series counts its parts: per episode.
    expect(
      duration(90, { format: sourced('MOVIE' as const), episodes: sourced(3) }),
    ).toBe('90 min per ep');
  });

  it('hides a missing, zero, fractional or absurd runtime', () => {
    expect(duration(null)).toBeNull();
    expect(duration(0)).toBeNull();
    expect(duration(24.5)).toBeNull();
    expect(duration(300)).toBe('300 min per ep');
    expect(duration(301)).toBeNull();
    expect(duration(1441, { episodes: sourced(1) })).toBeNull();
  });
});

describe('informationRows', () => {
  const rows = (overrides = {}) =>
    informationRows(overviewFacts(animeFixture(overrides))).map((row) => [
      row.label,
      row.text,
      row.datetime,
    ]);

  it('lists every fact in display order, dates as datetimes', () => {
    expect(rows()).toEqual([
      ['Format', 'TV', undefined],
      ['Episodes', '25', undefined],
      ['Duration', '24 min per ep', undefined],
      ['Status', 'Finished', undefined],
      ['Start date', '7 Apr 2013', '2013-04-07'],
      ['End date', '29 Sep 2013', '2013-09-29'],
      ['Season', 'Spring 2013', undefined],
      ['Studio', 'Wit Studio', undefined],
      ['Created by', 'Hajime Isayama', undefined],
    ]);
  });

  it('shows only the start date while airing: Status already says Airing', () => {
    const airing = rows({ status: sourced('RELEASING'), episodes: null });
    expect(airing.map(([label]) => label)).toContain('Start date');
    expect(airing.map(([label]) => label)).not.toContain('End date');
    expect(airing.find(([label]) => label === 'Status')?.[1]).toBe('Airing');
  });

  it('pluralises studios, joins creators and drops empty rows', () => {
    const many = rows({
      studios: sourced([
        { name: 'MAPPA', main: true },
        { name: 'Wit Studio', main: true },
      ]),
      creators: sourced(['A', 'B']),
    });
    expect(many).toContainEqual(['Studios', 'MAPPA, Wit Studio', undefined]);
    expect(many).toContainEqual(['Created by', 'A, B', undefined]);
    expect(
      rows({
        format: null,
        episodes: null,
        durationMinutes: null,
        status: null,
        startDate: null,
        season: null,
        studios: null,
        creators: null,
      }),
    ).toEqual([]);
  });
});
