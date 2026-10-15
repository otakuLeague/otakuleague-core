import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import { Clock, Random } from '../common/clock-and-random.module';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mergeAnime, SOURCE_PRIORITY, type StoredAnime } from './anime.merge';
import {
  ANIME_WITH_DATA,
  DB_DATA_SOURCE,
  DB_ID_SOURCE,
  fromAnimeRow,
  toSnapshotRow,
} from './anime.rows';
import { AnimeSourceSettings } from './sources/source-settings';
import {
  type AnimeRef,
  AnimeSourceAdapter,
  type AnimeSnapshot,
  SourceUnavailableError,
} from './sources/source.types';

export const ANIME_SOURCE_ADAPTERS = Symbol('ANIME_SOURCE_ADAPTERS');

const DAY_MS = 24 * 60 * 60 * 1000;
/** ADR 0006: airing shows refresh daily, the rest after 7 days. */
const AIRING_TTL_MS = DAY_MS;
const FINISHED_TTL_MS = 7 * DAY_MS;
const PURGE_AFTER_MS = 30 * DAY_MS;
const PURGE_BATCH = 1_000;

/** What one source said when asked to refresh an anime. */
export type RefreshOutcome =
  'stored' | 'not_found' | 'adult' | 'unavailable' | 'skipped';

export function sourceNotAvailable(): ApiException {
  return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
    code: 'ANIME_SOURCES_UNAVAILABLE',
    message: 'The anime data sources are unavailable. Try again later.',
  });
}

export function animeNotFound(): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, {
    code: 'ANIME_NOT_FOUND',
    message: 'No anime with this id.',
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

/**
 * Imports and refreshes anime from the enabled sources. Work for the same key is shared:
 * concurrent requests for one new anime run one import, and a background refresh of one
 * (anime, source) pair never runs twice at once.
 */
@Injectable()
export class AnimeImportService implements OnApplicationShutdown {
  private readonly logger = new Logger(AnimeImportService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /**
   * When a source last said "not found" for an anime: no new call before the TTL, so an anime
   * Jikan does not know does not cost a Jikan call per page view. In memory: a restart forgets
   * it, which only costs one extra call per anime.
   */
  private readonly notFoundAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
    private readonly settings: AnimeSourceSettings,
    @Inject(ANIME_SOURCE_ADAPTERS)
    private readonly adapters: readonly AnimeSourceAdapter[],
  ) {}

  isEnabled = (source: AnimeDataSource): boolean =>
    this.settings.get(source).enabled;

  /** Waits for every import and refresh in progress. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  /** Background work must not outlive the database connection. */
  async onApplicationShutdown(): Promise<void> {
    await this.settle();
  }

  /** True when an enabled source can look an anime up by this kind of id. */
  canLookUp(ref: AnimeRef): boolean {
    return this.enabledAdapters().some((adapter) =>
      adapter.lookups.includes(ref.source),
    );
  }

  /**
   * Imports an anime we do not have, from the first enabled source that knows it, then fills
   * in from the other sources in the background. Returns our anime id.
   */
  importNew(ref: AnimeRef): Promise<string> {
    return this.shared(`import:${ref.source}:${ref.externalId}`, () =>
      this.runImport(ref),
    );
  }

  /** Starts background refreshes for the enabled sources whose data is missing or stale. */
  refreshStale(anime: StoredAnime): void {
    for (const adapter of this.staleAdapters(anime)) {
      this.shared(`refresh:${anime.id}:${adapter.source}`, () =>
        this.refreshFrom(anime, adapter),
      ).catch((error: unknown) => {
        this.logger.error(
          `Refresh of anime ${anime.id} from ${adapter.source} failed: ${String(error)}`,
        );
      });
    }
  }

  /** Same as refreshStale, awaited. Used when no enabled source has stored anything yet. */
  refreshMissing(anime: StoredAnime): Promise<RefreshOutcome[]> {
    return Promise.all(
      this.staleAdapters(anime).map((adapter) =>
        this.shared(`refresh:${anime.id}:${adapter.source}`, () =>
          this.refreshFrom(anime, adapter),
        ),
      ),
    );
  }

  /**
   * ADR 0006: delete what nobody opened for 30 days, in batches so a mass expiry never holds
   * one long transaction. Returns the number of anime deleted.
   */
  async purgeUnviewed(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - PURGE_AFTER_MS);
    let total = 0;
    for (;;) {
      const batch = await this.prisma.anime.findMany({
        where: { lastViewedAt: { lt: cutoff } },
        select: { id: true },
        take: PURGE_BATCH,
      });
      if (batch.length === 0) return total;
      const { count } = await this.prisma.anime.deleteMany({
        where: {
          id: { in: batch.map(({ id }) => id) },
          lastViewedAt: { lt: cutoff },
        },
      });
      total += count;
      if (batch.length < PURGE_BATCH) return total;
    }
  }

  async loadStored(animeId: string): Promise<StoredAnime | null> {
    const row = await this.prisma.anime.findUnique({
      where: { id: animeId },
      include: ANIME_WITH_DATA,
    });
    return row ? fromAnimeRow(row) : null;
  }

  private shared<T>(key: string, task: () => Promise<T>): Promise<T> {
    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;
    const promise = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private enabledAdapters(): AnimeSourceAdapter[] {
    return this.adapters
      .filter((adapter) => this.isEnabled(adapter.source))
      .toSorted(
        (a, b) =>
          SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source),
      );
  }

  private staleAdapters(anime: StoredAnime): AnimeSourceAdapter[] {
    const now = this.clock.now();
    const status = mergeAnime(anime, this.isEnabled, now).status?.value;
    const ttl =
      status === 'RELEASING' || status === 'NOT_YET_RELEASED'
        ? AIRING_TTL_MS
        : FINISHED_TTL_MS;
    return this.enabledAdapters().filter((adapter) => {
      // A source cooling down after a failure is skipped, not retried on every view.
      if (adapter.isDown()) return false;
      const missedAt = this.notFoundAt.get(`${anime.id}:${adapter.source}`);
      if (missedAt !== undefined && now.getTime() - missedAt < ttl)
        return false;
      const stored = anime.snapshots.find(
        (snapshot) => snapshot.source === adapter.source,
      );
      return (
        stored === undefined ||
        now.getTime() - stored.fetchedAt.getTime() >= ttl
      );
    });
  }

  private async runImport(ref: AnimeRef): Promise<string> {
    // A request that missed the anime just before another import finished lands here after
    // that import's key is gone: the database already has it, so no source call.
    const linked = await this.prisma.animeExternalId.findUnique({
      where: {
        source_externalId: {
          source: DB_ID_SOURCE[ref.source],
          externalId: ref.externalId,
        },
      },
    });
    if (linked) return linked.animeId;
    const candidates = this.enabledAdapters().filter((adapter) =>
      adapter.lookups.includes(ref.source),
    );
    let unavailable = false;
    for (const adapter of candidates) {
      let result;
      try {
        result = await adapter.fetchAnime(ref);
      } catch (error) {
        if (!(error instanceof SourceUnavailableError)) throw error;
        this.logger.warn(error.message);
        unavailable = true;
        continue;
      }
      if (result.kind === 'not_found') continue;
      // Adult entries are neither stored nor shown (ADR 0006 update): same answer as unknown.
      if (result.snapshot.adult) throw animeNotFound();
      const animeId = await this.store(adapter, result.snapshot);
      // Registered before this import ends, so settle() never sees a gap between the two.
      void this.shared(`fill:${animeId}`, () => this.fillFromOthers(animeId));
      return animeId;
    }
    throw unavailable ? sourceNotAvailable() : animeNotFound();
  }

  private async fillFromOthers(animeId: string): Promise<void> {
    try {
      const anime = await this.loadStored(animeId);
      if (anime) this.refreshStale(anime);
    } catch (error) {
      this.logger.error(
        `Fill-in for anime ${animeId} failed: ${String(error)}`,
      );
    }
  }

  private async refreshFrom(
    anime: StoredAnime,
    adapter: AnimeSourceAdapter,
  ): Promise<RefreshOutcome> {
    // The source's own id first, so a refresh always asks about the same entry.
    const ref =
      anime.externalIds.find((id) => id.source === adapter.idSource) ??
      anime.externalIds.find((id) => adapter.lookups.includes(id.source));
    if (!ref) return 'skipped';
    let result;
    try {
      result = await adapter.fetchAnime(ref);
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      this.logger.warn(error.message);
      return 'unavailable';
    }
    if (result.kind === 'not_found') {
      // The source dropped it or never had it: its old values must not linger.
      this.notFoundAt.set(
        `${anime.id}:${adapter.source}`,
        this.clock.now().getTime(),
      );
      await this.prisma.animeSourceSnapshot.deleteMany({
        where: { animeId: anime.id, source: DB_DATA_SOURCE[adapter.source] },
      });
      return 'not_found';
    }
    if (result.snapshot.adult) {
      // Flagged adult by any source: the whole anime goes, ids and snapshots by cascade.
      await this.prisma.anime.deleteMany({ where: { id: anime.id } });
      return 'adult';
    }
    try {
      await this.store(adapter, result.snapshot, anime.id);
    } catch (error) {
      // Purged while this refresh ran: nothing left to refresh.
      if (isPrismaError(error, 'P2003')) return 'skipped';
      throw error;
    }
    return 'stored';
  }

  /**
   * Upserts one source's snapshot and links its ids. Without `animeId`, the anime is the one
   * the source's own id points to, or a new one; other ids are linked only when free, and a
   * conflict is flagged, never resolved by moving the id (ADR 0006). Another process importing
   * the same anime at once makes the insert of the own id fail (P2002): the retry then finds
   * that anime. A purge deleting it mid-way (P2003) also gets one retry.
   */
  private async store(
    adapter: AnimeSourceAdapter,
    snapshot: AnimeSnapshot,
    animeId?: string,
    retried = false,
  ): Promise<string> {
    const now = this.clock.now();
    const [own, ...others] = snapshot.ids;
    if (own?.source !== adapter.idSource) {
      throw new SourceUnavailableError(
        adapter.source,
        'snapshot without its own id',
      );
    }
    const ownKey = {
      source: DB_ID_SOURCE[own.source],
      externalId: own.externalId,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const known = await tx.animeExternalId.findUnique({
          where: { source_externalId: ownKey },
        });
        const id = animeId ?? known?.animeId ?? this.random.uuid();
        if (!animeId && !known) {
          await tx.anime.create({
            data: { id, createdAt: now, lastViewedAt: now },
          });
          await tx.animeExternalId.create({ data: { ...ownKey, animeId: id } });
        } else {
          await tx.animeExternalId.createMany({
            data: [{ ...ownKey, animeId: id }],
            skipDuplicates: true,
          });
        }
        await tx.animeExternalId.createMany({
          data: others.map((ref) => ({
            animeId: id,
            source: DB_ID_SOURCE[ref.source],
            externalId: ref.externalId,
          })),
          skipDuplicates: true,
        });
        const row = toSnapshotRow(snapshot, now);
        const dbSource = DB_DATA_SOURCE[adapter.source];
        await tx.animeSourceSnapshot.upsert({
          where: { animeId_source: { animeId: id, source: dbSource } },
          create: { animeId: id, source: dbSource, ...row },
          update: row,
        });
        await this.warnOnIdConflicts(tx, id, snapshot);
        return id;
      });
    } catch (error) {
      const retryable =
        isPrismaError(error, 'P2002') ||
        (!animeId && isPrismaError(error, 'P2003'));
      if (!retried && retryable) {
        return this.store(adapter, snapshot, animeId, true);
      }
      throw error;
    }
  }

  /** ADR 0006: an id already linked to another anime is flagged, never moved. */
  private async warnOnIdConflicts(
    tx: Prisma.TransactionClient,
    animeId: string,
    snapshot: AnimeSnapshot,
  ): Promise<void> {
    const elsewhere = await tx.animeExternalId.findMany({
      where: {
        animeId: { not: animeId },
        OR: snapshot.ids.map((id) => ({
          source: DB_ID_SOURCE[id.source],
          externalId: id.externalId,
        })),
      },
    });
    for (const conflict of elsewhere) {
      this.logger.warn(
        `Id conflict: ${conflict.source} ${conflict.externalId} belongs to anime ${conflict.animeId}, also claimed for ${animeId}; left for manual review`,
      );
    }
  }
}
