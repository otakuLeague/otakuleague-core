import { Injectable } from '@nestjs/common';
import type {
  AnimeSearchHit,
  AnimeSearchPage,
} from '@otakuleague/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AnimeImportService } from './anime-import.service';
import { rankAnime } from './anime-search.query';
import { toSearchHit } from './anime-search.view';
import { mergeAnime, SOURCE_PRIORITY } from './anime.merge';
import { ANIME_WITH_DATA, DB_DATA_SOURCE, fromAnimeRow } from './anime.rows';
import { Clock } from '../common/clock-and-random.module';

export interface AnimeSearchRequest {
  readonly query: string;
  readonly page: number;
  readonly pageSize: number;
}

/** Ranking scans every stored title (slice 1): bound the time one request can take. */
const RANK_TIMEOUT = '2s';

/**
 * A query with no letter or digit once decomposed (NFKD) cannot match: SQL normalisation
 * leaves nothing, or only marks and punctuation that pg_trgm ignores. Mirrors the SQL
 * loosely on purpose; it only skips the scan.
 */
const hasSearchableText = (query: string): boolean =>
  /[\p{L}\p{N}]/u.test(query.normalize('NFKD'));

/**
 * Searches the titles we already store (ADR 0016). Never calls a source, and never counts as
 * a view: listing an anime must not postpone its 30-day purge. `total` counts ranked anime;
 * a hit is dropped when its anime vanished between the two queries (purged) or no shown
 * source names an id for it, so a page can hold fewer hits than `total` implies.
 */
@Injectable()
export class AnimeSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly importer: AnimeImportService,
  ) {}

  async search({
    query,
    page,
    pageSize,
  }: AnimeSearchRequest): Promise<AnimeSearchPage> {
    const sources = SOURCE_PRIORITY.filter(this.importer.isEnabled).map(
      (source) => DB_DATA_SOURCE[source],
    );
    if (sources.length === 0 || !hasSearchableText(query))
      return { hits: [], page, pageSize, total: 0 };

    const ranked = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('statement_timeout', ${RANK_TIMEOUT}, true)`;
      return rankAnime(transaction, {
        query,
        sources,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
    });
    if (ranked.matches.length === 0) {
      return { hits: [], page, pageSize, total: ranked.total };
    }

    const rows = await this.prisma.anime.findMany({
      where: { id: { in: ranked.matches.map(({ animeId }) => animeId) } },
      include: ANIME_WITH_DATA,
    });
    const stored = new Map(rows.map((row) => [row.id, fromAnimeRow(row)]));
    const anilistIds = [...stored.values()].flatMap(({ externalIds }) =>
      externalIds.filter(({ source }) => source === 'anilist'),
    );
    const identities = await this.prisma.animeIdentity.findMany({
      where: {
        anilistId: { in: anilistIds.map(({ externalId }) => externalId) },
        removedAt: null,
      },
    });
    const slugByAnilistId = new Map(
      identities.map(({ anilistId, canonicalSlug }) => [
        anilistId,
        canonicalSlug,
      ]),
    );

    const now = this.clock.now();
    const hits = ranked.matches.flatMap((match): AnimeSearchHit[] => {
      const anime = stored.get(match.animeId);
      if (!anime) return [];
      const anilistId = anime.externalIds.find(
        ({ source }) => source === 'anilist',
      )?.externalId;
      const hit = toSearchHit(
        mergeAnime(anime, this.importer.isEnabled, now),
        (anilistId === undefined ? null : slugByAnilistId.get(anilistId)) ??
          null,
        match,
      );
      return hit ? [hit] : [];
    });
    return { hits, page, pageSize, total: ranked.total };
  }
}
