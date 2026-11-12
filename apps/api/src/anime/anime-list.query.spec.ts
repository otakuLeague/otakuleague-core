import { ANIME_LIST_KINDS } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  isFresh,
  listKey,
  listSpec,
  readWindow,
} from './anime-list.query';

const HOUR_MS = 3_600_000;

describe('listSpec', () => {
  it('has the ADR 0016 filter, sort and lifetime for every kind', () => {
    expect(ANIME_LIST_KINDS.map((kind) => [kind, listSpec(kind)])).toEqual([
      [
        'trending',
        {
          query: { sort: ['TRENDING_DESC', 'POPULARITY_DESC'] },
          ttlMs: HOUR_MS,
        },
      ],
      [
        'top',
        {
          query: { sort: ['SCORE_DESC', 'POPULARITY_DESC'] },
          ttlMs: 24 * HOUR_MS,
        },
      ],
      [
        'upcoming',
        {
          query: { sort: ['POPULARITY_DESC'], status: 'NOT_YET_RELEASED' },
          ttlMs: 24 * HOUR_MS,
        },
      ],
      [
        'airing',
        {
          query: { sort: ['POPULARITY_DESC'], status: 'RELEASING' },
          ttlMs: 6 * HOUR_MS,
        },
      ],
    ]);
  });

  it('keys a list by its kind', () => {
    expect(listKey('airing')).toBe('airing');
  });
});

describe('isFresh', () => {
  const fetchedAt = new Date('2026-11-12T10:00:00Z');

  it('is fresh up to, not including, the lifetime', () => {
    expect(
      isFresh(
        'trending',
        fetchedAt,
        new Date(fetchedAt.getTime() + HOUR_MS - 1),
      ),
    ).toBe(true);
    expect(
      isFresh('trending', fetchedAt, new Date(fetchedAt.getTime() + HOUR_MS)),
    ).toBe(false);
    expect(
      isFresh('top', fetchedAt, new Date(fetchedAt.getTime() + 23 * HOUR_MS)),
    ).toBe(true);
  });
});

describe('cursor', () => {
  it('round-trips every offset from 0 to 999', () => {
    for (const offset of [0, 1, 24, 50, 998, 999]) {
      expect(decodeCursor(encodeCursor(offset))).toBe(offset);
    }
  });

  it('is base64url of "v1:" and the offset', () => {
    expect(encodeCursor(24)).toBe(Buffer.from('v1:24').toString('base64url'));
  });

  it.each([
    ['not base64', '!!!'],
    ['empty', ''],
    ['wrong version', Buffer.from('v2:24').toString('base64url')],
    ['no offset', Buffer.from('v1:').toString('base64url')],
    ['negative', Buffer.from('v1:-1').toString('base64url')],
    ['fractional', Buffer.from('v1:1.5').toString('base64url')],
    ['padded', Buffer.from('v1:024').toString('base64url')],
    ['past the cap', encodeCursor(1_000)],
    ['hex', Buffer.from('v1:0x10').toString('base64url')],
  ])('rejects %s', (_name, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe('readWindow', () => {
  it('stays in one source page', () => {
    expect(readWindow(0, 24)).toEqual({ end: 24, firstPage: 1, lastPage: 1 });
    expect(readWindow(0, 50)).toEqual({ end: 50, firstPage: 1, lastPage: 1 });
  });

  it('spans two source pages across a boundary', () => {
    expect(readWindow(48, 24)).toEqual({ end: 72, firstPage: 1, lastPage: 2 });
    expect(readWindow(49, 50)).toEqual({ end: 99, firstPage: 1, lastPage: 2 });
  });

  it('starts on a page boundary', () => {
    expect(readWindow(50, 1)).toEqual({ end: 51, firstPage: 2, lastPage: 2 });
  });

  it('is cut at the 1000-entry cap', () => {
    expect(readWindow(999, 50)).toEqual({
      end: 1000,
      firstPage: 20,
      lastPage: 20,
    });
    expect(readWindow(980, 50)).toEqual({
      end: 1000,
      firstPage: 20,
      lastPage: 20,
    });
  });
});
