import { describe, expect, it } from 'vitest';
import { isFollowedEdge } from './franchise-graph';
import type { MediaRelation, RelationEdge } from './sources/source.types';

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
