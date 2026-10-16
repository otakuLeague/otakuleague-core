import type { RelationEdge } from './sources/source.types';

/**
 * ADR 0008: whether a franchise follows this edge out of the entry `from`. Shared by the
 * walker and the read-time component, so both always agree. SEQUEL and PREQUEL edges to
 * anime only; a BOUNDARY entry starts a franchise, so no edge between it and its prequels is
 * followed, from either side. Known limit: AniList edges are assumed symmetric (A lists B as
 * SEQUEL when B lists A as PREQUEL; all 106 recorded ones are); an edge listed on one side
 * only is followed only from that side.
 */
export function isFollowedEdge(
  from: number,
  { relation, target }: RelationEdge,
  boundaries: ReadonlySet<number>,
): boolean {
  if (target.mediaType !== 'ANIME') return false;
  if (relation === 'SEQUEL') return !boundaries.has(target.anilistId);
  if (relation === 'PREQUEL') return !boundaries.has(from);
  return false;
}
