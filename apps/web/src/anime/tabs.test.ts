import type { AnimeFranchiseView } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import { franchiseFixture as franchise, franchiseSeason } from './fixtures';
import { seasonOptions, tabSegmentFromParam, tabSegmentOf } from './tabs';

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
        imported: true,
        label: 'Season 1',
        year: 2013,
        isCurrent: true,
        upcoming: false,
      },
      {
        anilistId: 20958,
        slug: 'aot-season-2',
        imported: true,
        label: 'Season 2',
        year: null,
        isCurrent: false,
        upcoming: true,
      },
    ]);
  });

  it('lists a season not imported yet, even when it is the only other one', () => {
    const notImported = [two[0]!, { ...two[1]!, slug: null, imported: false }];
    expect(
      seasonOptions(franchise(notImported))?.map(({ slug }) => slug),
    ).toEqual(['attack-on-titan', null]);
  });

  it('reads the imported flag, a missing one (older API) as false', () => {
    const legacy: AnimeFranchiseView = {
      ...franchise(two),
      mainLine: [
        two[0]!,
        { ...two[1]!, imported: false },
        { ...two[1]!, imported: undefined },
      ],
    };
    expect(seasonOptions(legacy)?.map(({ imported }) => imported)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('has nothing to show for one season, none, unavailable or no franchise', () => {
    expect(seasonOptions(franchise([franchiseSeason({})]))).toBeNull();
    expect(seasonOptions(franchise([]))).toBeNull();
    expect(seasonOptions(franchise(two, 'unavailable'))).toBeNull();
    expect(seasonOptions(null)).toBeNull();
  });
});
