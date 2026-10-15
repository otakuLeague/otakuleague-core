import { describe, expect, it } from 'vitest';
import {
  canonicalCandidates,
  MAX_SLUG_LENGTH,
  romajiAlias,
  type SlugSource,
  slugify,
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
