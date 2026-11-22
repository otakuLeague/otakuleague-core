import type { AnimeTag } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import { altTitlesOf, displayText, themesOf } from './overview-themes';

const tag = (name: string, rank: number | null, spoiler = false): AnimeTag => ({
  name,
  rank,
  spoiler,
});
const themes = (tags: readonly AnimeTag[], genres = ['Action', 'Drama']) =>
  themesOf(animeFixture({ tags: sourced(tags), genres: sourced(genres) }));
const names = (list: readonly { name: string }[]) => list.map((t) => t.name);

describe('displayText', () => {
  it('strips bidi controls and refuses invisible or over-long text', () => {
    expect(displayText(' ‮evil‬ ', 60)).toBe('evil');
    expect(displayText('​⁦ ⁩﻿', 60)).toBeNull();
    expect(displayText('x'.repeat(61), 60)).toBeNull();
    expect(displayText('x'.repeat(60), 60)).toHaveLength(60);
  });
});

describe('themesOf', () => {
  it('sorts tags by rank, then name, and hides those under 60, unranked or not finite', () => {
    const { open } = themes([
      tag('Military', 80),
      tag('Gore', 95),
      tag('Dystopian', 80),
      tag('Survival', 60),
      tag('Tragedy', 59),
      tag('Unranked', null),
      tag('Broken', Number.NaN),
      tag('Huge', Number.POSITIVE_INFINITY),
      tag('Over', 140),
    ]);
    expect(open.map((t) => [t.name, t.rank])).toEqual([
      ['Over', 100],
      ['Gore', 95],
      ['Dystopian', 80],
      ['Military', 80],
      ['Survival', 60],
    ]);
  });

  it('dedupes tags after sorting, a spoiler copy wins, and drops genre repeats', () => {
    const { genres, open, spoilers } = themes(
      [
        tag(' drama ', 90),
        tag('Gore', 70),
        tag('GORE', 90, true),
        tag('Twist', 65, true),
      ],
      ['Action', 'Drama', 'ＤＲＡＭＡ'],
    );
    expect(genres).toEqual(['Action', 'Drama']);
    expect(open).toEqual([]);
    expect(spoilers).toEqual([
      { name: 'GORE', rank: 90 },
      { name: 'Twist', rank: 65 },
    ]);
  });

  it('drops over-long or invisible names', () => {
    const { genres, open } = themes(
      [tag('y'.repeat(61), 90), tag('​', 90), tag('Gore', 90)],
      ['x'.repeat(61), 'Action'],
    );
    expect(genres).toEqual(['Action']);
    expect(names(open)).toEqual(['Gore']);
  });

  it('keeps at most 30 tags', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      tag(`Tag ${String(i).padStart(2, '0')}`, 100 - i, i % 2 === 1),
    );
    const { open, spoilers } = themes(many);
    expect(open.length + spoilers.length).toBe(30);
    expect(open[0]).toEqual({ name: 'Tag 00', rank: 100 });
    expect(spoilers[0]?.name).toBe('Tag 01');
  });

  it('is empty without genres or tags', () => {
    expect(themesOf(animeFixture({ genres: null, tags: null }))).toEqual({
      genres: [],
      open: [],
      spoilers: [],
    });
  });
});

describe('altTitlesOf', () => {
  it('groups the titles the page does not show, then synonyms', () => {
    expect(
      altTitlesOf(animeFixture({ synonyms: sourced(['AoT', 'SnK', ' ']) })),
    ).toEqual([
      { kind: 'romaji', label: 'Romaji', texts: ['Shingeki no Kyojin'] },
      { kind: 'native', label: 'Native', texts: ['進撃の巨人'] },
      { kind: 'synonym', label: 'Also known as', texts: ['AoT', 'SnK'] },
    ]);
  });

  it('dedupes after NFKC, case and whitespace normalisation', () => {
    const groups = altTitlesOf(
      animeFixture({
        synonyms: sourced([
          'ＳＨＩＮＧＥＫＩ  no kyojin',
          'attack   on titan',
          'AoT',
          'aot',
        ]),
      }),
    );
    expect(groups.flatMap((g) => g.texts)).toEqual([
      'Shingeki no Kyojin',
      '進撃の巨人',
      'AoT',
    ]);
  });

  it('works without an English title (romaji is then the page title)', () => {
    expect(altTitlesOf(animeFixture({ titleEnglish: null }))).toEqual([
      { kind: 'native', label: 'Native', texts: ['進撃の巨人'] },
    ]);
  });

  it('drops titles over 200 characters and keeps at most 12', () => {
    const synonyms = [
      'z'.repeat(201),
      ...Array.from({ length: 20 }, (_, i) => `Name ${i}`),
    ];
    const groups = altTitlesOf(animeFixture({ synonyms: sourced(synonyms) }));
    const texts = groups.flatMap((g) => g.texts);
    expect(texts).toHaveLength(12);
    expect(texts).not.toContain('z'.repeat(201));
  });
});
