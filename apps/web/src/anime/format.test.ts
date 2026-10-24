import { describe, expect, it } from 'vitest';
import { excerpt } from './format';
import { ANIME_TABS, tabHref } from './tabs';

describe('excerpt', () => {
  it('keeps the first paragraph, cut on a word with an ellipsis', () => {
    expect(excerpt('One.\n\nTwo.')).toBe('One.');
    expect(excerpt('alpha beta gamma', 12)).toBe('alpha beta…');
    expect(excerpt(undefined)).toBeUndefined();
    expect(excerpt('   ')).toBeUndefined();
  });
});

describe('tabHref', () => {
  it('builds each tab route, Overview being the bare slug', () => {
    expect(
      ANIME_TABS.map(({ segment }) => tabHref('frieren', segment)),
    ).toEqual([
      '/anime/frieren',
      '/anime/frieren/episodes',
      '/anime/frieren/cast',
      '/anime/frieren/music',
      '/anime/frieren/related',
      '/anime/frieren/stats',
      '/anime/frieren/community',
    ]);
  });
});
