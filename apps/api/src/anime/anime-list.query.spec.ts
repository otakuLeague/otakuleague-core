import { ANIME_LIST_KINDS } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import {
  assembleWindow,
  decodeCursor,
  encodeCursor,
  isFresh,
  listKey,
  listSpec,
  readWindow,
  type WindowBlock,
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

describe('assembleWindow', () => {
  const T0 = new Date('2026-11-12T10:00:00Z');
  const block = (
    page: number,
    count: number,
    extra: Partial<WindowBlock<number>> = {},
  ): WindowBlock<number> => ({
    page,
    entries: Array.from({ length: count }, (_, i) => (page - 1) * 50 + i),
    hasNextPage: true,
    fetchedAt: T0,
    fresh: true,
    ...extra,
  });

  it('reads one block', () => {
    const window = assembleWindow([block(1, 50)], 0, 3);

    expect(window).toMatchObject({
      entries: [0, 1, 2],
      nextOffset: 3,
      freshness: 'fresh',
      fetchedAt: T0,
    });
  });

  it('joins two blocks, each against its own first position', () => {
    // Page 1 is short (an entry was dropped): page 2 still starts at position 50.
    const window = assembleWindow([block(1, 49), block(2, 50)], 48, 4);

    expect(window.entries).toEqual([48, 50, 51]);
    expect(window.nextOffset).toBe(52);
  });

  it('ends on a last block with nothing left', () => {
    const window = assembleWindow([block(1, 3, { hasNextPage: false })], 0, 24);

    expect(window).toMatchObject({ entries: [0, 1, 2], nextOffset: null });
  });

  it('continues when the last block has more than the window', () => {
    expect(
      assembleWindow([block(1, 30, { hasNextPage: false })], 0, 10).nextOffset,
    ).toBe(10);
  });

  it('is stale with the oldest fetchedAt when any block is stale', () => {
    const older = new Date(T0.getTime() - 1_000);
    const window = assembleWindow(
      [block(1, 50), block(2, 50, { fresh: false, fetchedAt: older })],
      40,
      20,
    );

    expect(window).toMatchObject({ freshness: 'stale', fetchedAt: older });
  });

  it('is empty and at the end without blocks', () => {
    expect(assembleWindow([], 500, 24)).toEqual({
      entries: [],
      nextOffset: null,
      freshness: 'fresh',
      fetchedAt: null,
    });
  });

  it('stops at the cap even when AniList has more', () => {
    const window = assembleWindow([block(20, 50)], 999, 50);

    expect(window).toMatchObject({ entries: [999], nextOffset: null });
  });
});
