import { describe, expect, it } from 'vitest';
import { activeSection, isWithin } from './nav';

describe('activeSection', () => {
  it.each([
    ['/discover', 'discover'],
    ['/discover/airing', 'discover'],
    ['/season', 'season'],
    ['/season/2026/fall', 'season'],
    ['/season/', 'season'],
    ['/top', 'rankings'],
    ['/top/anime', 'rankings'],
    ['/leaderboard', 'leaderboard'],
    ['/leaderboard/2026', 'leaderboard'],
  ] as const)('puts %s in %s', (pathname, section) => {
    expect(activeSection(pathname)).toBe(section);
  });

  it.each([
    '/',
    '/anime/frieren',
    '/seasonality',
    '/topics',
    '/discovery',
    '/search',
    '',
  ])('leaves %s outside every section (whole segments only)', (pathname) => {
    expect(activeSection(pathname)).toBeNull();
  });

  it('has no section without a path (prerendered fallback)', () => {
    expect(activeSection(null)).toBeNull();
  });
});

describe('isWithin', () => {
  it('matches the prefix and the paths below it only', () => {
    expect(isWithin('/discover/airing', '/discover/airing')).toBe(true);
    expect(isWithin('/discover/airing/2', '/discover/airing')).toBe(true);
    expect(isWithin('/discover/airingx', '/discover/airing')).toBe(false);
    expect(isWithin(null, '/discover/airing')).toBe(false);
  });
});
