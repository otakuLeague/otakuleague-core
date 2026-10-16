import { ANIME_FORMATS, ANIME_STATUSES } from '@otakuleague/shared-types';
import type { AnimeRelationNode } from '../generated/prisma/client';
import { integer, oneOf, partialDate, record, text } from './sources/parse';
import {
  MANGA_FORMATS,
  MEDIA_RELATIONS,
  type MediaSummary,
  type RelationEdge,
  type RelationNode,
} from './sources/source.types';

// anime_relation_node rows (ADR 0008). `edges` is only ever written by toRelationRow, but is
// still read defensively, like the snapshot JSON columns.

/** Columns for one walked node, except last_used_at (set on insert, bumped when served). */
export function toRelationRow(node: RelationNode, fetchedAt: Date) {
  return {
    fetchedAt,
    titleEnglish: node.titleEnglish,
    titleRomaji: node.titleRomaji,
    format: node.format,
    status: node.status,
    startYear: node.startDate?.year ?? null,
    startMonth: node.startDate?.month ?? null,
    startDay: node.startDate?.day ?? null,
    coverImageUrl: node.coverImageUrl,
    // Spread into plain objects: Prisma's JSON input type rejects interfaces.
    edges: node.edges.map(({ relation, target }) => ({
      relation,
      target: {
        ...target,
        startDate: target.startDate && { ...target.startDate },
      },
    })),
  };
}

function readSummary(value: unknown): MediaSummary | null {
  const raw = record(value);
  const anilistId = integer(raw.anilistId, 1);
  if (anilistId === null) return null;
  const fields = {
    anilistId,
    status: oneOf(raw.status, ANIME_STATUSES),
    startDate: partialDate(raw.startDate),
    titleEnglish: text(raw.titleEnglish),
    titleRomaji: text(raw.titleRomaji),
    coverImageUrl: text(raw.coverImageUrl),
  };
  if (raw.mediaType === 'ANIME') {
    return {
      ...fields,
      mediaType: 'ANIME',
      format: oneOf(raw.format, ANIME_FORMATS),
    };
  }
  if (raw.mediaType === 'MANGA') {
    return {
      ...fields,
      mediaType: 'MANGA',
      format: oneOf(raw.format, MANGA_FORMATS),
    };
  }
  return null;
}

function readEdge(value: unknown): RelationEdge | null {
  const raw = record(value);
  const relation = oneOf(raw.relation, MEDIA_RELATIONS);
  const target = readSummary(raw.target);
  return relation === null || target === null ? null : { relation, target };
}

export function fromRelationRow(row: AnimeRelationNode): RelationNode {
  return {
    anilistId: row.anilistId,
    mediaType: 'ANIME',
    format: row.format,
    status: row.status,
    startDate:
      row.startYear === null
        ? null
        : { year: row.startYear, month: row.startMonth, day: row.startDay },
    titleEnglish: row.titleEnglish,
    titleRomaji: row.titleRomaji,
    coverImageUrl: row.coverImageUrl,
    edges: (Array.isArray(row.edges) ? row.edges : []).flatMap((edge) => {
      const read = readEdge(edge);
      return read === null ? [] : [read];
    }),
  };
}
