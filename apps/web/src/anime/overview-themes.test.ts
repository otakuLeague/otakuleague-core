import type { AnimeTag } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import { animeFixture, sourced } from './fixtures';
import { altTitlesOf, themesOf } from './overview-themes';

const tag = (name: string, rank: number | null, spoiler = false): AnimeTag => ({
  name,
  rank,
  spoiler,
});
const themes = (tags: readonly AnimeTag[], genres = ['Action', 'Drama']) =>
  themesOf(animeFixture({ tags: sourced(tags), genres: sourced(genres) }));

describe('themesOf', () => {
  it('sorts tags by rank, then name, and hides those under 60 or unranked', () => {
    const { tags } = themes([
      tag('Military', 80),
      tag('Gore', 95),
      tag('Dystopian', 80),
      tag('Survival', 60),
      tag('Tragedy', 59),
      tag('Unranked', null),
    ]);
    expect(tags.map((t) => [t.name, t.rank])).toEqual([
      ['Gore', 95],
      ['Dystopian', 80],
      ['Military', 80],
      ['Survival', 60],
    ]);
  });

  it('drops a tag that repeats a genre or another tag, whatever its case', () => {
    const { genres, tags } = themes([
      tag(' drama ', 90),
      tag('Gore', 90),
      tag('GORE', 70),
    ]);
    expect(genres).toEqual(['Action', 'Drama']);
    expect(tags.map((t) => t.name)).toEqual(['Gore']);
  });

  it('keeps at most 30 tags and splits spoilers out', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      tag(`Tag ${String(i).padStart(2, '0')}`, 100 - i, i % 2 === 1),
    );
    const { tags } = themes(many);
    expect(tags).toHaveLength(30);
    expect(tags[0]).toEqual({ name: 'Tag 00', rank: 100, visibility: 'open' });
    expect(tags[1]?.visibility).toBe('spoiler');
  });

  it('is empty without genres or tags', () => {
    expect(themesOf(animeFixture({ genres: null, tags: null }))).toEqual({
      genres: [],
      tags: [],
    });
  });
});

describe('altTitlesOf', () => {
  it('lists the titles the page does not show, then synonyms', () => {
    expect(
      altTitlesOf(animeFixture({ synonyms: sourced(['AoT', 'SnK', ' ']) })),
    ).toEqual([
      { kind: 'romaji', text: 'Shingeki no Kyojin' },
      { kind: 'native', text: '進撃の巨人' },
      { kind: 'synonym', text: 'AoT' },
      { kind: 'synonym', text: 'SnK' },
    ]);
  });

  it('dedupes after NFKC, case and whitespace normalisation', () => {
    const titles = altTitlesOf(
      animeFixture({
        synonyms: sourced([
          'ＳＨＩＮＧＥＫＩ  no kyojin',
          'attack   on titan',
          'AoT',
          'aot',
        ]),
      }),
    );
    expect(titles.map((t) => t.text)).toEqual([
      'Shingeki no Kyojin',
      '進撃の巨人',
      'AoT',
    ]);
  });

  it('works without an English title (romaji is then the page title)', () => {
    expect(altTitlesOf(animeFixture({ titleEnglish: null }))).toEqual([
      { kind: 'native', text: '進撃の巨人' },
    ]);
  });

  it('keeps at most 12', () => {
    const synonyms = Array.from({ length: 20 }, (_, i) => `Name ${i}`);
    expect(
      altTitlesOf(animeFixture({ synonyms: sourced(synonyms) })),
    ).toHaveLength(12);
  });
});
