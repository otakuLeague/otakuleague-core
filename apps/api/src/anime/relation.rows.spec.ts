import { describe, expect, it } from 'vitest';
import { fromRelationRow, toRelationRow } from './relation.rows';
import { mapAniListRelationNodes } from './sources/anilist.mapper';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import type { RelationNode } from './sources/source.types';

const FETCHED_AT = new Date('2026-10-16T12:00:00.000Z');
/** Frieren season 1: a manga SOURCE target, entries without an English title. */
const frieren = mapAniListRelationNodes(
  record(record((fixture('anilist-walk-frieren') as unknown[])[0]).response)
    .data,
).find((node) => node.anilistId === 154587) as RelationNode;

const rowOf = (edges: unknown) => ({
  anilistId: 154587,
  lastUsedAt: FETCHED_AT,
  ...toRelationRow(frieren, FETCHED_AT),
  edges: edges as never,
});

describe('relation rows', () => {
  it('reads back the node it stored, manga targets included', () => {
    const row = toRelationRow(frieren, FETCHED_AT);

    expect(fromRelationRow(rowOf(row.edges))).toEqual(frieren);
    expect(frieren.edges.some((e) => e.target.mediaType === 'MANGA')).toBe(
      true,
    );
  });

  it('drops edges with an unknown relation or a corrupt target, and edges that are not a list', () => {
    const kept = toRelationRow(frieren, FETCHED_AT).edges[0];
    const corrupt = [
      kept,
      { ...kept, relation: 'REBOOT' },
      { relation: 'SEQUEL', target: { ...kept?.target, mediaType: 'NOVEL' } },
      { relation: 'SEQUEL', target: { anilistId: 'x' } },
      null,
    ];

    expect(fromRelationRow(rowOf(corrupt)).edges).toEqual([frieren.edges[0]]);
    expect(fromRelationRow(rowOf({ edges: [] })).edges).toEqual([]);
  });
});
