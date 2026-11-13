import { describe, expect, it } from 'vitest';
import {
  canonicalCandidates,
  MAX_SLUG_LENGTH,
  pickCanonical,
  romajiAlias,
  type SlugSource,
  slugify,
  slugSource,
} from './anime.slug';

const source = (overrides: Partial<SlugSource>): SlugSource => ({
  anilistId: 16498,
  titleEnglish: 'Attack on Titan',
  titleRomaji: 'Shingeki no Kyojin',
  year: 2013,
  format: 'TV',
  ...overrides,
});

describe('slugify', () => {
  it.each([
    ['Attack on Titan', 'attack-on-titan'],
    [
      'Re:ZERO -Starting Life in Another World-',
      're-zero-starting-life-in-another-world',
    ],
    ['86 EIGHTY-SIX', '86-eighty-six'],
    ['86', '86'],
    ['[Oshi No Ko]', 'oshi-no-ko'],
    ['Gintama°', 'gintama'],
    ['HUNTER×HUNTER (2011)', 'hunter-x-hunter-2011'],
    ["JoJo's Bizarre Adventure", 'jojos-bizarre-adventure'],
    ['Frieren: Beyond Journey’s End', 'frieren-beyond-journeys-end'],
    ['Kaguya-sama: Love is War', 'kaguya-sama-love-is-war'],
    ['Pokémon', 'pokemon'],
    ['Weiß Kreuz', 'weiss-kreuz'],
    ['Kærlighed Œuvre Øst Łódź Đ', 'kaerlighed-oeuvre-ost-lodz-d'],
    ['Sousou no Frieren', 'sousou-no-frieren'],
    [
      'Fate/stay night & Unlimited Blade Works',
      'fate-stay-night-and-unlimited-blade-works',
    ],
    ['ＯＮＥ ＰＩＥＣＥ', 'one-piece'],
    ['  --Spaces--  ', 'spaces'],
    ['進撃の巨人', ''],
    ['מתקפת הטיטאנים', ''],
    ['', ''],
  ])('%j -> %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });
});

describe('canonicalCandidates', () => {
  it('tries base, then year, then year and format, then the AniList id', () => {
    expect(canonicalCandidates(source({}))).toEqual([
      'attack-on-titan',
      'attack-on-titan-2013',
      'attack-on-titan-2013-tv',
      'attack-on-titan-16498',
    ]);
  });

  it('skips the rungs whose value is missing', () => {
    expect(
      canonicalCandidates(source({ year: null, format: 'TV_SHORT' })),
    ).toEqual([
      'attack-on-titan',
      'attack-on-titan-tv-short',
      'attack-on-titan-16498',
    ]);
    expect(canonicalCandidates(source({ format: null }))).toEqual([
      'attack-on-titan',
      'attack-on-titan-2013',
      'attack-on-titan-16498',
    ]);
    expect(canonicalCandidates(source({ year: null, format: null }))).toEqual([
      'attack-on-titan',
      'attack-on-titan-16498',
    ]);
  });

  it('falls back to romaji, then to anime-<id>, when a title gives nothing', () => {
    expect(canonicalCandidates(source({ titleEnglish: null }))[0]).toBe(
      'shingeki-no-kyojin',
    );
    expect(canonicalCandidates(source({ titleEnglish: '進撃の巨人' }))[0]).toBe(
      'shingeki-no-kyojin',
    );
    expect(
      canonicalCandidates(
        source({ titleEnglish: null, titleRomaji: '進撃' }),
      )[0],
    ).toBe('anime-16498');
  });

  it('never offers a reserved word', () => {
    expect(
      canonicalCandidates(source({ titleEnglish: 'Search', format: null })),
    ).toEqual(['search-2013', 'search-16498']);
  });

  it('keeps every candidate within the length cap, cut on a hyphen', () => {
    const long = 'word '.repeat(30).trim();
    const candidates = canonicalCandidates(
      source({ titleEnglish: long, anilistId: 123456 }),
    );

    for (const slug of candidates) {
      expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(candidates[0]).toBe('word-'.repeat(16).slice(0, -1));
    expect(candidates.at(-1)).toMatch(/^(word-)+123456$/);
  });

  it('cuts a single long word where the cap falls', () => {
    const [slug] = canonicalCandidates(
      source({ titleEnglish: 'a'.repeat(100) }),
    );

    expect(slug).toBe('a'.repeat(MAX_SLUG_LENGTH));
  });
});

describe('romajiAlias', () => {
  it('is the romaji slug, or null when the romaji gives nothing', () => {
    expect(romajiAlias(source({}))).toBe('shingeki-no-kyojin');
    expect(romajiAlias(source({ titleRomaji: null }))).toBeNull();
    expect(romajiAlias(source({ titleRomaji: '進撃' }))).toBeNull();
    expect(romajiAlias(source({ titleRomaji: 'New' }))).toBeNull();
  });
});

describe('slugSource', () => {
  const fields = {
    titleEnglish: 'Attack on Titan',
    titleRomaji: 'Shingeki no Kyojin',
    startDate: { year: 2013 },
    seasonYear: 2012,
    format: 'TV' as const,
  };

  it('takes the start year, else the season year, else none', () => {
    expect(slugSource(1, fields).year).toBe(2013);
    expect(slugSource(1, { ...fields, startDate: null }).year).toBe(2012);
    expect(
      slugSource(1, { ...fields, startDate: null, seasonYear: null }).year,
    ).toBeNull();
  });

  it('ignores a year outside 1900-2100', () => {
    expect(
      slugSource(1, { ...fields, startDate: { year: 20 } }).year,
    ).toBeNull();
    expect(
      slugSource(1, { ...fields, startDate: { year: 2101 } }).year,
    ).toBeNull();
    expect(slugSource(1, { ...fields, startDate: { year: 1900 } }).year).toBe(
      1900,
    );
  });

  it('keeps both titles, the id and the format as they are', () => {
    expect(slugSource(16498, { ...fields, titleEnglish: null })).toEqual({
      anilistId: 16498,
      titleEnglish: null,
      titleRomaji: 'Shingeki no Kyojin',
      year: 2013,
      format: 'TV',
    });
  });
});

describe('pickCanonical', () => {
  const candidates = ['a', 'a-2013', 'a-2013-tv', 'a-1'];

  it('takes the first rung when nothing is taken', () => {
    expect(pickCanonical(candidates, new Map(), 1)).toBe('a');
  });

  it('skips rungs another anime holds', () => {
    const owners = new Map([
      ['a', 2],
      ['a-2013', 3],
    ]);
    expect(pickCanonical(candidates, owners, 1)).toBe('a-2013-tv');
  });

  it('takes a rung the same anime already holds', () => {
    expect(pickCanonical(candidates, new Map([['a', 1]]), 1)).toBe('a');
  });

  it('answers undefined when every rung is taken, and for no candidates', () => {
    const owners = new Map(candidates.map((slug) => [slug, 9]));
    expect(pickCanonical(candidates, owners, 1)).toBeUndefined();
    expect(pickCanonical([], new Map(), 1)).toBeUndefined();
  });
});
