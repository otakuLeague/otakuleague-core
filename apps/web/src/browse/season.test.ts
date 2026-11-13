import { describe, expect, it } from 'vitest';
import {
  currentSeason,
  parseSeasonRequest,
  seasonHref,
  seasonLabel,
  stepSeason,
} from './season';

const NOW = new Date('2026-11-13T12:00:00Z');
const FALL_2026 = { season: 'FALL', year: 2026 } as const;

describe('currentSeason', () => {
  it('uses UTC calendar quarters', () => {
    expect(currentSeason(new Date('2026-12-31T23:59:59Z'))).toEqual(FALL_2026);
    expect(currentSeason(new Date('2027-01-01T00:00:00Z'))).toEqual({
      season: 'WINTER',
      year: 2027,
    });
    expect(currentSeason(new Date('2026-04-01T00:00:00Z')).season).toBe('SPRING');
    expect(currentSeason(new Date('2026-09-30T23:59:59Z')).season).toBe('SUMMER');
  });
});

describe('parseSeasonRequest', () => {
  it('defaults to the current season, page 1', () => {
    expect(parseSeasonRequest({}, NOW)).toEqual({ season: FALL_2026, page: 1 });
  });

  it('reads season case-insensitively and ignores old-site params', () => {
    expect(
      parseSeasonRequest(
        { season: 'SuMmEr', year: '2025', sort: 'score', q: 'x', formats: 'TV' },
        NOW,
      ),
    ).toEqual({ season: { season: 'SUMMER', year: 2025 }, page: 1 });
  });

  it.each([
    [{ season: 'fall' }],
    [{ year: '2025' }],
    [{ season: 'autumn', year: '2025' }],
    [{ season: 'fall', year: '1916' }],
    [{ season: 'fall', year: '2028' }],
    [{ season: 'fall', year: '2026.0' }],
    [{ season: 'fall', year: '0x7EA' }],
    [{ season: ['fall', 'winter'], year: '2025' }],
  ])('falls back to the current season for %j', (params) => {
    expect(parseSeasonRequest(params, NOW).season).toEqual(FALL_2026);
  });

  it('accepts the bounds: Winter 1917 and next year', () => {
    expect(parseSeasonRequest({ season: 'winter', year: '1917' }, NOW).season).toEqual({
      season: 'WINTER',
      year: 1917,
    });
    expect(parseSeasonRequest({ season: 'fall', year: '2027' }, NOW).season).toEqual({
      season: 'FALL',
      year: 2027,
    });
  });

  it.each([
    ['0', 1],
    ['-1', 1],
    ['abc', 1],
    ['1.5', 1],
    ['3', 3],
    ['10', 10],
    ['11', 10],
  ])('reads page %s as %i', (page, expected) => {
    expect(parseSeasonRequest({ page }, NOW).page).toBe(expected);
  });
});

describe('stepSeason', () => {
  it('wraps the year both ways', () => {
    expect(stepSeason({ season: 'WINTER', year: 2026 }, -1, NOW)).toEqual({
      season: 'FALL',
      year: 2025,
    });
    expect(stepSeason(FALL_2026, 1, NOW)).toEqual({ season: 'WINTER', year: 2027 });
    expect(stepSeason(FALL_2026, -1, NOW)).toEqual({ season: 'SUMMER', year: 2026 });
  });

  it('stops at Winter 1917 and at Fall of next year', () => {
    expect(stepSeason({ season: 'WINTER', year: 1917 }, -1, NOW)).toBeNull();
    expect(stepSeason({ season: 'FALL', year: 2027 }, 1, NOW)).toBeNull();
    expect(stepSeason({ season: 'SUMMER', year: 2027 }, 1, NOW)).toEqual({
      season: 'FALL',
      year: 2027,
    });
  });
});

describe('seasonHref and seasonLabel', () => {
  it('lower-cases the season and omits page 1', () => {
    expect(seasonHref(FALL_2026)).toBe('/season?season=fall&year=2026');
    expect(seasonHref(FALL_2026, 1)).toBe('/season?season=fall&year=2026');
    expect(seasonHref(FALL_2026, 2)).toBe('/season?season=fall&year=2026&page=2');
  });

  it('names the season for people', () => {
    expect(seasonLabel(FALL_2026)).toBe('Fall 2026');
    expect(seasonLabel({ season: 'WINTER', year: 1917 })).toBe('Winter 1917');
  });
});
