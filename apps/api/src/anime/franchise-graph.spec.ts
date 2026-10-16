import { describe, expect, it } from 'vitest';
import { isFollowedEdge, traverseFranchise } from './franchise-graph';
import type {
  MediaRelation,
  RelationEdge,
  RelationNode,
} from './sources/source.types';

const edge = (
  relation: MediaRelation,
  anilistId: number,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
): RelationEdge => ({
  relation,
  target:
    mediaType === 'ANIME'
      ? {
          anilistId,
          mediaType,
          format: 'TV',
          status: 'FINISHED',
          startDate: null,
          titleEnglish: null,
          titleRomaji: 'x',
          coverImageUrl: null,
        }
      : {
          anilistId,
          mediaType,
          format: 'MANGA',
          status: 'FINISHED',
          startDate: null,
          titleEnglish: null,
          titleRomaji: 'x',
          coverImageUrl: null,
        },
});

describe('isFollowedEdge', () => {
  const none = new Set<number>();

  it('follows SEQUEL and PREQUEL edges to anime only', () => {
    expect(isFollowedEdge(1, edge('SEQUEL', 2), none)).toBe(true);
    expect(isFollowedEdge(1, edge('PREQUEL', 2), none)).toBe(true);
    expect(isFollowedEdge(1, edge('SIDE_STORY', 2), none)).toBe(false);
    expect(isFollowedEdge(1, edge('ALTERNATIVE', 2), none)).toBe(false);
    expect(isFollowedEdge(1, edge('SEQUEL', 2, 'MANGA'), none)).toBe(false);
  });

  it('cuts the link between a BOUNDARY entry and its prequel, from both sides', () => {
    // 11741 (Fate/Zero Season 2) <-> 19603 (UBW, a boundary), 19603 <-> 20792 (UBW 2nd).
    const boundaries = new Set([19603]);

    expect(isFollowedEdge(11741, edge('SEQUEL', 19603), boundaries)).toBe(
      false,
    );
    expect(isFollowedEdge(19603, edge('PREQUEL', 11741), boundaries)).toBe(
      false,
    );
    expect(isFollowedEdge(19603, edge('SEQUEL', 20792), boundaries)).toBe(true);
    expect(isFollowedEdge(20792, edge('PREQUEL', 19603), boundaries)).toBe(
      true,
    );
  });

  it('decides each side of an asymmetric edge on its own (known limit)', () => {
    // A lists B as SEQUEL but B lists nothing: only a walk through A reaches B.
    expect(isFollowedEdge(1, edge('SEQUEL', 2), none)).toBe(true);
    // Both sides claiming SEQUEL of each other: each is followed from its own side.
    expect(isFollowedEdge(2, edge('SEQUEL', 1), new Set([1]))).toBe(false);
    expect(isFollowedEdge(1, edge('SEQUEL', 2), new Set([1]))).toBe(true);
  });
});

describe('traverseFranchise', () => {
  const node = (anilistId: number, ...sequels: number[]): RelationNode => ({
    anilistId,
    mediaType: 'ANIME',
    format: 'TV',
    status: 'FINISHED',
    startDate: null,
    titleEnglish: null,
    titleRomaji: 'x',
    coverImageUrl: null,
    edges: sequels.map((id) => edge('SEQUEL', id)),
  });
  const rows = new Map([
    [1, node(1, 2, 3)],
    [2, node(2)],
    [3, node(3)],
  ]);
  const from =
    (map: Map<number, ReturnType<typeof node>>) => (ids: readonly number[]) =>
      Promise.resolve(ids.flatMap((id) => map.get(id) ?? []));

  it('reaches every entry, level by level', async () => {
    const result = await traverseFranchise(1, from(rows), new Set());

    expect(result.state).toBe('complete');
    expect(result.nodes.map(({ anilistId }) => anilistId)).toEqual([1, 2, 3]);
  });

  it('reports an id without a row as missing, and walks on', async () => {
    const partial = new Map(rows);
    partial.delete(2);

    const result = await traverseFranchise(1, from(partial), new Set());

    expect(result.state).toBe('missing');
    expect(result.nodes.map(({ anilistId }) => anilistId)).toEqual([1, 3]);
  });

  it('keeps only the ids a level asked for, once each', async () => {
    const extra = node(99, 2);
    const noisy = (ids: readonly number[]) =>
      Promise.resolve(
        ids[0] === 1 ? [rows.get(1)!, rows.get(1)!, extra] : [rows.get(3)!],
      );

    const result = await traverseFranchise(1, noisy, new Set());

    expect(result.state).toBe('missing');
    expect(result.nodes.map(({ anilistId }) => anilistId)).toEqual([1, 3]);
  });

  it('stops when the loader says so', async () => {
    const result = await traverseFranchise(
      1,
      () => Promise.resolve(null),
      new Set(),
    );

    expect(result).toEqual({ state: 'stopped', nodes: [] });
  });
});
