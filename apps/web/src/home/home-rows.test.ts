import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import { listEntries, listEntry, listResult } from './fixtures';
import {
  cardLink,
  cardTitle,
  HOME_ROWS,
  HOME_ROW_MAX_CARDS,
  toHomeRowState,
} from './home-rows';

describe('HOME_ROWS', () => {
  it('lists trending, this season and top rated, in that order', () => {
    expect(HOME_ROWS.map((row) => [row.kind, row.href])).toEqual([
      ['airing', '/discover/airing'],
      ['seasonal', '/season'],
      ['top', '/top/anime'],
    ]);
  });
});

describe('toHomeRowState', () => {
  const failures: readonly ApiFailure[] = [
    { kind: 'network' },
    { kind: 'timeout' },
    { kind: 'invalid_response', status: 200 },
    {
      kind: 'api_error',
      status: 503,
      error: {
        error: { code: 'ANIME_SOURCES_UNAVAILABLE', message: 'internal detail' },
      },
    },
  ];

  it.each(failures)('fails the row on a $kind failure', (failure) => {
    expect(toHomeRowState({ ok: false, failure })).toEqual({
      kind: 'failed',
      failure,
    });
  });

  it('is empty when the list has no entries', () => {
    expect(toHomeRowState(listResult([]))).toEqual({ kind: 'empty' });
  });

  it('keeps a single entry', () => {
    const entry = listEntry();
    expect(toHomeRowState(listResult([entry]))).toEqual({
      kind: 'loaded',
      entries: [entry],
    });
  });

  it(`caps the row at ${HOME_ROW_MAX_CARDS} cards, first ones first`, () => {
    const state = toHomeRowState(listResult(listEntries(12)));
    expect(state.kind === 'loaded' && state.entries.map((e) => e.anilistId)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });

  it('drops a repeated AniList id, keeping the first, before capping', () => {
    const entries = listEntries(9);
    const repeated = listEntry({ anilistId: 1, titleEnglish: 'Repeat' });
    const state = toHomeRowState(listResult([...entries.slice(0, 1), repeated, ...entries.slice(1)]));
    expect(state.kind === 'loaded' && state.entries.map((e) => e.anilistId)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });
});

describe('cardLink', () => {
  it('links the canonical slug, followable', () => {
    expect(cardLink({ anilistId: 1, slug: 'monster' })).toEqual({
      href: '/anime/monster',
      rel: undefined,
    });
  });

  it('links the AniList id route with nofollow when no slug is claimed', () => {
    expect(cardLink({ anilistId: 19, slug: null })).toEqual({
      href: '/anime/anilist/19',
      rel: 'nofollow',
    });
  });
});

describe('cardTitle', () => {
  it('prefers English, then romaji, then a placeholder', () => {
    expect(cardTitle({ titleEnglish: 'Monster', titleRomaji: 'MONSTER' })).toBe(
      'Monster',
    );
    expect(cardTitle({ titleEnglish: null, titleRomaji: 'Mushishi' })).toBe(
      'Mushishi',
    );
    expect(cardTitle({ titleEnglish: null, titleRomaji: null })).toBe(
      'Untitled',
    );
  });
});
