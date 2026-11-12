import {
  ANIME_TITLE_KINDS,
  type AnimeTitleKind,
} from '@otakuleague/shared-types';
import type { PrismaService } from '../prisma/prisma.service';

export interface AnimeRankRequest {
  /** The raw query: normalised in SQL, with the same function as the titles (ADR 0015). */
  readonly query: string;
  /** Enabled sources in priority order, as database enum values. */
  readonly sources: readonly string[];
  readonly limit: number;
  readonly offset: number;
}

export interface AnimeRankMatch {
  readonly animeId: string;
  readonly kind: AnimeTitleKind;
  readonly title: string;
}

export interface AnimeRankPage {
  readonly total: number;
  readonly matches: readonly AnimeRankMatch[];
}

/** The `kind` numbers of the VALUES list in the query below, in order. */
const KIND_BY_RANK: readonly AnimeTitleKind[] = [
  'english',
  'romaji',
  'native',
  'synonym',
];

interface RankRow {
  readonly total: number;
  readonly anime_id: string | null;
  readonly kind: number | null;
  readonly title: string | null;
}

/**
 * Slice 1 of ADR 0015: scores every stored title of the enabled sources with pg_trgm
 * word_similarity. Exact match first, then similarity, then popularity, then id. A page past
 * the end returns no match but the right total. Parameters only, never string-built SQL.
 */
export async function rankAnime(
  prisma: Pick<PrismaService, '$queryRaw'>,
  { query, sources, limit, offset }: AnimeRankRequest,
): Promise<AnimeRankPage> {
  const rows = await prisma.$queryRaw<RankRow[]>`
    WITH scored AS (
      SELECT x.anime_id, x.source, x.kind, x.title,
             x.normalized = anime_search_normalize(${query}) AS exact,
             word_similarity(anime_search_normalize(${query}), x.normalized) AS score
      FROM (
        SELECT s.anime_id, s.source, t.kind, t.title, anime_search_normalize(t.title) AS normalized
        FROM anime_source_snapshot s
        CROSS JOIN LATERAL (
          VALUES (1, s.title_english), (2, s.title_romaji), (3, s.title_native)
          UNION ALL SELECT 4, unnest(s.synonyms)
        ) AS t(kind, title)
        WHERE s.source = ANY(${sources}::anime_data_source[]) AND t.title IS NOT NULL
      ) x
      WHERE anime_search_normalize(${query}) <% x.normalized
    ),
    best AS (
      SELECT DISTINCT ON (anime_id) anime_id, kind, title, exact, score
      FROM scored
      ORDER BY anime_id, exact DESC, score DESC, kind,
               array_position(${sources}::anime_data_source[], source)
    ),
    page AS (
      SELECT best.*, popularity.members
      FROM best
      LEFT JOIN LATERAL (
        SELECT s.members FROM anime_source_snapshot s
        WHERE s.anime_id = best.anime_id AND s.source = ANY(${sources}::anime_data_source[])
        ORDER BY array_position(${sources}::anime_data_source[], s.source) LIMIT 1
      ) popularity ON true
      ORDER BY exact DESC, score DESC, popularity.members DESC NULLS LAST, anime_id
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT totals.total::int AS total, page.anime_id, page.kind, page.title
    FROM (SELECT count(*) AS total FROM best) totals
    LEFT JOIN page ON true
    ORDER BY page.exact DESC, page.score DESC, page.members DESC NULLS LAST, page.anime_id`;
  const matches = rows.flatMap((row) => {
    const kind = row.kind === null ? undefined : KIND_BY_RANK[row.kind - 1];
    return row.anime_id === null || row.title === null || kind === undefined
      ? []
      : [{ animeId: row.anime_id, kind, title: row.title }];
  });
  return { total: rows[0]?.total ?? 0, matches };
}
