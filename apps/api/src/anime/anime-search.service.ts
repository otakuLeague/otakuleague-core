import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AnimeSearchHit,
  AnimeSearchPage,
} from '@otakuleague/shared-types';
import {
  type ApiCaller,
  PREVIEW_VISITOR_KEY,
  UNKNOWN_VISITOR_KEY,
  type VisitorKey,
  visitorKeyOf,
} from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AnimeImportService } from './anime-import.service';
import { rankAnime } from './anime-search.query';
import { toSearchHit } from './anime-search.view';
import { mergeAnime, SOURCE_PRIORITY } from './anime.merge';
import { ANIME_WITH_DATA, DB_DATA_SOURCE, fromAnimeRow } from './anime.rows';
import { Clock } from '../common/clock-and-random.module';
import { SearchLimits } from './search-limits';

export interface AnimeSearchRequest {
  readonly query: string;
  readonly page: number;
  readonly pageSize: number;
}

/** A shared bucket's refusals are logged at most this often. */
const LIMIT_WARN_INTERVAL_MS = 60_000;

/** This visitor's cap: Retry-After is the seconds until its next token, 1 or 2. */
function searchVisitorLimited(retryAfterSeconds: number): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    {
      code: 'ANIME_SEARCH_VISITOR_LIMIT_REACHED',
      message:
        'You searched many times in a short time. Try again in a moment.',
    },
    { retryAfterSeconds },
  );
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
    private readonly limits: SearchLimits,
  ) {}

  private readonly logger = new Logger(AnimeSearchService.name);
  private readonly sharedWarnedAt = new Map<'preview' | 'unknown', number>();

  async search(
    { query, page, pageSize }: AnimeSearchRequest,
    caller: ApiCaller,
  ): Promise<AnimeSearchPage> {
    this.chargeVisitor(caller);
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

  /** One token per valid search, before any work; an open caller is not limited. */
  private chargeVisitor(caller: ApiCaller): void {
    const visitorKey = visitorKeyOf(caller);
    if (visitorKey === null) return;
    const take = this.limits.takeVisitor(visitorKey);
    if (take.taken) return;
    this.warnSharedVisitorLimited(visitorKey);
    throw searchVisitorLimited(take.retryAfterSeconds);
  }

  /** Only the shared buckets are logged, once a minute each; never the key: it is a client IP. */
  private warnSharedVisitorLimited(visitorKey: VisitorKey): void {
    const shared =
      visitorKey === PREVIEW_VISITOR_KEY
        ? 'preview'
        : visitorKey === UNKNOWN_VISITOR_KEY
          ? 'unknown'
          : null;
    if (shared === null) return;
    const now = this.clock.now().getTime();
    if (now - (this.sharedWarnedAt.get(shared) ?? 0) < LIMIT_WARN_INTERVAL_MS) {
      return;
    }
    this.sharedWarnedAt.set(shared, now);
    this.logger.warn(
      `Search visitor cap reached on the shared ${shared} bucket: searches are refused.`,
    );
  }
}
