import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import { overviewFacts, synopsisOf } from './overview-facts';

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
      collapsible: true,
    });
    expect(synopsisOf('One paragraph. (Source: ANN)')?.source).toBe('ANN');
  });

  it('collapses past 350 characters or one paragraph, never at exactly 350', () => {
    expect(synopsisOf('a'.repeat(350))?.collapsible).toBe(false);
    expect(synopsisOf('a'.repeat(351))?.collapsible).toBe(true);
    expect(synopsisOf('Short.')?.collapsible).toBe(false);
  });
});

describe('overviewFacts', () => {
  it('reads format, season and main studio from the header facts', () => {
    const facts = overviewFacts(animeFixture());
    expect(facts.format).toBe('TV');
    expect(facts.season).toBe('Spring 2013');
    expect(facts.studios).toEqual(['Wit Studio']);
    expect(facts.genres).toEqual(['Action', 'Drama']);
    expect(facts.episodes).toBe('25 × 24 min');
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
      synopsis: null,
      format: null,
      episodes: null,
      aired: null,
      season: null,
      studios: [],
      genres: [],
    });
  });
});
