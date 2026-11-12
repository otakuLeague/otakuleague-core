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
import { PURGE_AFTER_MS } from './cache-ttl';
import { sourceNotAvailable } from './anime-import.service';
import {
  assembleWindow,
  decodeCursor,
  encodeCursor,
  isFresh,
  listKey,
  listSpec,
  readWindow,
  type WindowBlock,
} from './anime-list.query';
import {
  fromListRow,
  type StoredListBlock,
  toListRow,
} from './anime-list.rows';
import { AniListAdapter, type ListFetchWait } from './sources/anilist.adapter';
import { AnimeSourceSettings } from './sources/source-settings';
import {
  type ListBlock,
  type ListedAnime,
  SourceUnavailableError,
  UnusableAnswerError,
} from './sources/source.types';

/** After a failed fetch of a block nobody asks AniList for it again for this long. */
const RETRY_AFTER_MS = 5 * 60 * 1000;
/** Reasons (source-http.ts) that are not a failed list answer: no retry delay for the block. */
const QUEUE_FULL = 'queue full';
const COOLING_DOWN = 'cooling down';
const RETRY_LATER = 'retry later';

/**
 * Catalog lists (ADR 0016): cache-aside over anime_list_page, stale-while-revalidate. A
 * stored block is served at once, fresh or stale; a stale one is refreshed in the background
 * when a request slot is free right now. A block we do not hold waits for one AniList call,
 * but only the block that follows a stored one with a next page: a client cannot make us ask
 * for arbitrary pages. Fetches are shared per block in this process.
 */
@Injectable()
export class AnimeListService implements OnModuleDestroy {
  private readonly logger = new Logger(AnimeListService.name);
  private readonly inFlight = new Map<string, Promise<StoredListBlock>>();
  /** When a block failed lately, until when it is not asked again (epoch ms). */
  private readonly retryAt = new Map<string, number>();
  private stopping = false;

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
    this.stopping = true;
    await this.settle();
  }

  /** ADR 0016: pages nobody refreshed for 30 days (a page being read is refreshed long before). */
  async purgeStale(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - PURGE_AFTER_MS);
    const { count } = await this.prisma.animeListPage.deleteMany({
      where: { fetchedAt: { lt: cutoff } },
    });
    return count;
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

    const { firstPage, lastPage } = readWindow(offset, limit);
    const blocks: WindowBlock<ListedAnime>[] = [];
    const first = await this.readBlock(
      kind,
      firstPage,
      firstPage === 1 || (await this.hasNextAfter(kind, firstPage - 1)),
    );
    if (first !== null) blocks.push(first);
    if (first?.hasNextPage === true && lastPage > firstPage) {
      const second = await this.readBlock(kind, lastPage, true);
      if (second !== null) blocks.push(second);
    }
    const window = assembleWindow(blocks, offset, limit);
    return {
      kind,
      entries: await this.withSlugs(window.entries),
      nextCursor:
        window.nextOffset === null ? null : encodeCursor(window.nextOffset),
      freshness: window.freshness,
      fetchedAt: (window.fetchedAt ?? this.clock.now()).toISOString(),
    };
  }

  /** True when the stored block `page` says another one follows. */
  private async hasNextAfter(
    kind: AnimeListKind,
    page: number,
  ): Promise<boolean> {
    return (await this.stored(kind, page))?.hasNextPage === true;
  }

  private async stored(
    kind: AnimeListKind,
    page: number,
  ): Promise<StoredListBlock | null> {
    const row = await this.prisma.animeListPage.findUnique({
      where: { listKey_page: { listKey: listKey(kind), page } },
    });
    return row === null ? null : fromListRow(row);
  }

  /** The block, or null when it is not stored and may not be fetched (past the list's end). */
  private async readBlock(
    kind: AnimeListKind,
    page: number,
    mayFetch: boolean,
  ): Promise<WindowBlock<ListedAnime> | null> {
    const block = await this.stored(kind, page);
    if (block === null) {
      if (!mayFetch) return null;
      try {
        return this.toWindowBlock(
          page,
          await this.fetchShared(kind, page, 'visitor'),
          true,
        );
      } catch (error) {
        if (!(error instanceof SourceUnavailableError)) throw error;
        if (error.reason !== RETRY_LATER) this.logger.warn(error.message);
        throw sourceNotAvailable();
      }
    }
    const fresh = isFresh(kind, block.fetchedAt, this.clock.now());
    if (!fresh && !this.stopping && !this.anilist.isDown()) {
      void this.fetchShared(kind, page, 'background');
    }
    return this.toWindowBlock(page, block, fresh);
  }

  private toWindowBlock(
    page: number,
    block: StoredListBlock,
    fresh: boolean,
  ): WindowBlock<ListedAnime> {
    return { page, fresh, ...block };
  }

  /**
   * One AniList call per block at a time, however many requests wait for it. A background
   * task's failure is logged here, once; a visitor handles the failure of the one it awaits.
   */
  private fetchShared(
    kind: AnimeListKind,
    page: number,
    wait: ListFetchWait,
  ): Promise<StoredListBlock> {
    const key = `${listKey(kind)}#${page}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const task = this.fetchAndStore(kind, page, key, wait).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, task);
    if (wait === 'background') {
      task.catch((error: unknown) => {
        const quiet =
          error instanceof SourceUnavailableError &&
          (error.reason === QUEUE_FULL || error.reason === RETRY_LATER);
        if (!quiet) {
          this.logger.warn(`Refresh of ${key} failed: ${String(error)}`);
        }
      });
    }
    return task;
  }

  private async fetchAndStore(
    kind: AnimeListKind,
    page: number,
    key: string,
    wait: ListFetchWait,
  ): Promise<StoredListBlock> {
    const now = this.clock.now();
    if ((this.retryAt.get(key) ?? 0) > now.getTime()) {
      throw new SourceUnavailableError('anilist', RETRY_LATER);
    }
    let fetched: ListBlock;
    try {
      fetched = await this.anilist.fetchList(listSpec(kind).query, page, wait);
      await this.refuseEmptyReplacement(kind, page, fetched);
    } catch (error) {
      if (
        error instanceof SourceUnavailableError &&
        error.reason !== QUEUE_FULL &&
        !error.reason.startsWith(COOLING_DOWN)
      ) {
        this.retryAt.set(key, now.getTime() + RETRY_AFTER_MS);
      }
      throw error;
    }
    this.retryAt.delete(key);
    const row = toListRow(fetched, now);
    await this.prisma.animeListPage.upsert({
      where: { listKey_page: { listKey: listKey(kind), page } },
      create: { listKey: listKey(kind), page, ...row },
      update: row,
    });
    return { ...fetched, fetchedAt: now };
  }

  /** An empty first page never replaces a page that has entries: that is a broken answer. */
  private async refuseEmptyReplacement(
    kind: AnimeListKind,
    page: number,
    fetched: ListBlock,
  ): Promise<void> {
    if (page !== 1 || fetched.entries.length > 0) return;
    const current = await this.stored(kind, page);
    if (current !== null && current.entries.length > 0) {
      throw new UnusableAnswerError('anilist', 'empty first page of a list');
    }
  }

  /** Slug from the identity when we know the anime; removed anime are dropped. */
  private async withSlugs(
    entries: readonly ListedAnime[],
  ): Promise<AnimeListEntry[]> {
    if (entries.length === 0) return [];
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
