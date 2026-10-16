import type { RelationEdge, RelationNode } from './sources/source.types';

/** Entries per franchise (ADR 0008; an estimate, the longest recorded walk has 14). */
export const NODE_CAP = 60;

/**
 * ADR 0008: whether a franchise follows this edge out of the entry `from`. SEQUEL and PREQUEL
 * edges to anime only; a BOUNDARY entry means "the franchise starts here", so no edge between
 * it and its prequels is followed, in either direction. Known limit: AniList edges are
 * assumed symmetric (A lists B as SEQUEL when B lists A as PREQUEL; all 106 recorded ones
 * are); an edge listed on one side only is followed only from that side.
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

/**
 * How a traversal ended: every entry reached; `missing`, some id had no row or no answer
 * (not walked through); `truncated` by the node cap; `stopped` by the loader.
 */
export type TraversalState = 'complete' | 'missing' | 'truncated' | 'stopped';

export interface Traversal {
  readonly state: TraversalState;
  /** In traversal order. */
  readonly nodes: readonly RelationNode[];
  /** Ids reached that the loader had no node for. */
  readonly missingIds: readonly number[];
}

/**
 * The one franchise traversal, shared by the walker (its loader reuses fresh rows and asks
 * AniList for the others) and the read path (its loader reads stored rows), so both reach the
 * same entries by construction. Level by level from the start over isFollowedEdge, with a
 * sorted frontier, so a node cap keeps the same entries whatever is cached. `loadLevel` gives
 * the nodes it has for those ids, or null to stop.
 */
export async function traverseFranchise(
  startId: number,
  loadLevel: (
    ids: readonly number[],
  ) => Promise<readonly RelationNode[] | null>,
  boundaries: ReadonlySet<number>,
  nodeCap = NODE_CAP,
): Promise<Traversal> {
  const seen = new Set<number>();
  const nodes: RelationNode[] = [];
  const missingIds: number[] = [];
  let frontier = [startId];
  while (frontier.length > 0) {
    if (seen.size >= nodeCap) return { state: 'truncated', nodes, missingIds };
    const level = frontier.slice(0, nodeCap - seen.size);
    for (const id of level) seen.add(id);
    const loaded = await loadLevel(level);
    if (loaded === null) return { state: 'stopped', nodes, missingIds };
    // Only the ids this level asked for, once each: a loader passes external data on.
    const wanted = new Set(level);
    const kept = loaded.filter(({ anilistId }) => wanted.delete(anilistId));
    missingIds.push(...wanted);
    nodes.push(...kept);
    // The cap cut this level: entries are missing even if the next level is empty.
    if (level.length < frontier.length) {
      return { state: 'truncated', nodes, missingIds };
    }
    const next = kept.flatMap(({ anilistId, edges }) =>
      edges
        .filter((edge) => isFollowedEdge(anilistId, edge, boundaries))
        .map(({ target }) => target.anilistId)
        .filter((id) => !seen.has(id)),
    );
    frontier = [...new Set(next)].toSorted((a, b) => a - b);
  }
  return {
    state: missingIds.length > 0 ? 'missing' : 'complete',
    nodes,
    missingIds,
  };
}
