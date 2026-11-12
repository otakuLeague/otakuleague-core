import { describe, expect, it } from 'vitest';
import { franchiseFixture as franchise, franchiseSeason } from './fixtures';
import {
  seasonHref,
  seasonOptions,
  tabSegmentFromParam,
  tabSegmentOf,
} from './tabs';

describe('tabSegmentOf', () => {
  it('finds the tab of a path, Overview for the bare slug or anything else', () => {
    expect(tabSegmentOf('/anime/aot/episodes', 'aot')).toBe('episodes');
    expect(tabSegmentOf('/anime/aot/cast/', 'aot')).toBe('cast');
    expect(tabSegmentOf('/anime/aot', 'aot')).toBe('');
    expect(tabSegmentOf('/anime/aot/nope', 'aot')).toBe('');
    expect(tabSegmentOf('/anime/aot/cast/extra', 'aot')).toBe('');
    expect(tabSegmentOf('/anime/other/cast', 'aot')).toBe('');
  });
});

describe('tabSegmentFromParam', () => {
  it('reads an optional catch-all tab: Overview when absent, null for anything unknown', () => {
    expect(tabSegmentFromParam(undefined)).toBe('');
    expect(tabSegmentFromParam([])).toBe('');
    expect(tabSegmentFromParam(['episodes'])).toBe('episodes');
    expect(tabSegmentFromParam(['nope'])).toBeNull();
    expect(tabSegmentFromParam([''])).toBeNull();
    expect(tabSegmentFromParam(['cast', 'x'])).toBeNull();
  });
});

describe('seasonHref', () => {
  it('opens an imported season on its slug, on the same tab', () => {
    const season = { anilistId: 20958, slug: 'aot-season-2' };
    expect(seasonHref(season, 'cast')).toBe('/anime/aot-season-2/cast');
    expect(seasonHref(season, '')).toBe('/anime/aot-season-2');
  });

  it('opens a season not imported yet through its AniList id, on the same tab', () => {
    const season = { anilistId: 20958, slug: null };
    expect(seasonHref(season, 'episodes')).toBe(
      '/anime/anilist/20958/episodes',
    );
    expect(seasonHref(season, '')).toBe('/anime/anilist/20958');
  });
});

describe('seasonOptions', () => {
  const two = [
    franchiseSeason({}),
    franchiseSeason({
      anilistId: 20958,
      slug: 'aot-season-2',
      label: 'Season 2',
      isCurrent: false,
      status: 'NOT_YET_RELEASED',
      startDate: null,
    }),
  ];

  it('trims the main line for the selector', () => {
    expect(seasonOptions(franchise(two))).toEqual([
      {
        anilistId: 16498,
        slug: 'attack-on-titan',
        label: 'Season 1',
        year: 2013,
        isCurrent: true,
        upcoming: false,
      },
      {
        anilistId: 20958,
        slug: 'aot-season-2',
        label: 'Season 2',
        year: null,
        isCurrent: false,
        upcoming: true,
      },
    ]);
  });

  it('lists a season not imported yet, even when it is the only other one', () => {
    const notImported = [two[0]!, { ...two[1]!, slug: null }];
    expect(
      seasonOptions(franchise(notImported))?.map(({ slug }) => slug),
    ).toEqual(['attack-on-titan', null]);
  });

  it('has nothing to show for one season, none, unavailable or no franchise', () => {
    expect(seasonOptions(franchise([franchiseSeason({})]))).toBeNull();
    expect(seasonOptions(franchise([]))).toBeNull();
    expect(seasonOptions(franchise(two, 'unavailable'))).toBeNull();
    expect(seasonOptions(null)).toBeNull();
  });
});
