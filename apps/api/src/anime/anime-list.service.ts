import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  ANIME_LIST_DEFAULT_LIMIT,
  type AnimeListEntry,
  type AnimeListKind,
  type AnimeListPage,
} from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { sourceNotAvailable } from './anime-import.service';
import {
  decodeCursor,
  encodeCursor,
  isFresh,
  listKey,
  listSpec,
  LIST_PAGE_SIZE,
  readWindow,
} from './anime-list.query';
import {
  fromListRow,
  type StoredListBlock,
  toListRow,
} from './anime-list.rows';
import { AniListAdapter, type ListFetchWait } from './sources/anilist.adapter';
import { AnimeSourceSettings } from './sources/source-settings';
import { SourceUnavailableError } from './sources/source.types';

/** A stored block, and whether it is within its lifetime. */
interface BlockRead {
  readonly block: StoredListBlock;
  readonly freshness: AnimeListPage['freshness'];
}

/**
 * Catalog lists (ADR 0016): cache-aside over anime_list_page, stale-while-revalidate. A
 * stored block is served at once, fresh or stale; a stale one is refreshed in the background
 * when a request slot is free right now. A block we do not hold waits for one AniList call.
 * Fetches are shared per block in this process.
 */
@Injectable()
export class AnimeListService implements OnModuleDestroy {
  private readonly logger = new Logger(AnimeListService.name);
  private readonly inFlight = new Map<string, Promise<StoredListBlock>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: AnimeSourceSettings,
    private readonly anilist: AniListAdapter,
  ) {}

  /** Waits for every fetch in progress. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  /** Background work must not outlive the database connection. */
  async onModuleDestroy(): Promise<void> {
    await this.settle();
  }

  async getList(
    kind: AnimeListKind,
    cursor: string | undefined,
    limit = ANIME_LIST_DEFAULT_LIMIT,
  ): Promise<AnimeListPage> {
    const offset = cursor === undefined ? 0 : decodeCursor(cursor);
    if (offset === null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'cursor', message: 'cursor is not valid' }],
      });
    }
    if (!this.settings.get('anilist').enabled) throw sourceNotAvailable();

    const { end, firstPage, lastPage } = readWindow(offset, limit);
    const reads = [await this.readBlock(kind, firstPage)];
    if (lastPage > firstPage && reads[0]?.block.hasNextPage === true) {
      reads.push(await this.readBlock(kind, lastPage));
    }
    // Source pages are full blocks of 50 except the last, so a position maps to its block.
    const base = (firstPage - 1) * LIST_PAGE_SIZE;
    const loaded = reads.flatMap(({ block }) => block.entries);
    const window = loaded.slice(offset - base, end - base);
    const hasMore =
      loaded.length > end - base || reads.at(-1)?.block.hasNextPage === true;
    return {
      kind,
      entries: await this.withSlugs(window),
      nextCursor: end < 1_000 && hasMore ? encodeCursor(end) : null,
      freshness: reads.every(({ freshness }) => freshness === 'fresh')
        ? 'fresh'
        : 'stale',
      fetchedAt: new Date(
        Math.min(...reads.map(({ block }) => block.fetchedAt.getTime())),
      ).toISOString(),
    };
  }

  private async readBlock(
    kind: AnimeListKind,
    page: number,
  ): Promise<BlockRead> {
    const row = await this.prisma.animeListPage.findUnique({
      where: { listKey_page: { listKey: listKey(kind), page } },
    });
    const block = row === null ? null : fromListRow(row);
    if (block === null) {
      return {
        block: await this.fetchShared(kind, page, 'visitor'),
        freshness: 'fresh',
      };
    }
    if (isFresh(kind, block.fetchedAt, this.clock.now())) {
      return { block, freshness: 'fresh' };
    }
    if (!this.anilist.isDown()) {
      this.fetchShared(kind, page, 'background').catch((error: unknown) =>
        this.logger.warn(
          `Refresh of ${listKey(kind)} page ${page} failed: ${String(error)}`,
        ),
      );
    }
    return { block, freshness: 'stale' };
  }

  /** One AniList call per block at a time, however many requests wait for it. */
  private fetchShared(
    kind: AnimeListKind,
    page: number,
    wait: ListFetchWait,
  ): Promise<StoredListBlock> {
    const key = `${listKey(kind)}#${page}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const task = this.fetchAndStore(kind, page, wait).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, task);
    return task;
  }

  private async fetchAndStore(
    kind: AnimeListKind,
    page: number,
    wait: ListFetchWait,
  ): Promise<StoredListBlock> {
    let fetched;
    try {
      fetched = await this.anilist.fetchList(listSpec(kind).query, page, wait);
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        if (wait === 'visitor') this.logger.warn(error.message);
        throw wait === 'visitor' ? sourceNotAvailable() : error;
      }
      throw error;
    }
    const row = toListRow(fetched, this.clock.now());
    await this.prisma.animeListPage.upsert({
      where: { listKey_page: { listKey: listKey(kind), page } },
      create: { listKey: listKey(kind), page, ...row },
      update: row,
    });
    return { ...fetched, fetchedAt: row.fetchedAt };
  }

  /** Slug from the identity when we know the anime; removed anime are dropped. */
  private async withSlugs(
    entries: readonly StoredListBlock['entries'][number][],
  ): Promise<AnimeListEntry[]> {
    const identities = await this.prisma.animeIdentity.findMany({
      where: { anilistId: { in: entries.map(({ anilistId }) => anilistId) } },
      select: { anilistId: true, canonicalSlug: true, removedAt: true },
    });
    const byId = new Map(
      identities.map((identity) => [identity.anilistId, identity]),
    );
    return entries.flatMap((entry) => {
      const identity = byId.get(entry.anilistId);
      if (identity !== undefined && identity.removedAt !== null) return [];
      return [{ ...entry, slug: identity?.canonicalSlug ?? null }];
    });
  }
}
