import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import {
  type ApiCaller,
  UNKNOWN_VISITOR_KEY,
  type VisitorKey,
  visitorKeyOf,
} from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import { Clock, Random } from '../common/clock-and-random.module';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mergeAnime, SOURCE_PRIORITY, type StoredAnime } from './anime.merge';
import { PURGE_AFTER_MS, refreshTtlMs } from './cache-ttl';
import {
  ANIME_WITH_DATA,
  DB_DATA_SOURCE,
  DB_ID_SOURCE,
  fromAnimeRow,
  toSnapshotRow,
} from './anime.rows';
import {
  canonicalCandidates,
  pickCanonical,
  romajiAlias,
  slugify,
  slugSource,
} from './anime.slug';
import { AnimeSourceSettings } from './sources/source-settings';
import {
  type AnimeRef,
  AnimeSourceAdapter,
  type AnimeSnapshot,
  BACKED_OFF_REASON,
  type FetchPriority,
  refusedBeforeSending,
  type SourceResult,
  SourceUnavailableError,
  UnusableAnswerError,
} from './sources/source.types';
import { IMPORT_REFILL_MS, ImportLimits } from './import-limits';
import { backoffKey, SourceBackoff } from './source-backoff';

export const ANIME_SOURCE_ADAPTERS = Symbol('ANIME_SOURCE_ADAPTERS');

const PURGE_BATCH = 1_000;
/** Concurrent imports racing for the same id or slug: each lost race costs one attempt. */
const STORE_ATTEMPTS = 3;
const LIMIT_WARN_INTERVAL_MS = 60_000;

/** What one source said when asked to refresh an anime. */
export type RefreshOutcome =
  'stored' | 'not_found' | 'removed' | 'unavailable' | 'skipped';

export function sourceNotAvailable(): ApiException {
  return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
    code: 'ANIME_SOURCES_UNAVAILABLE',
    message: 'The anime data sources are unavailable. Try again later.',
  });
}

/** The global cap: Retry-After is one refill step, 20 s (ADR 0019 item 12). */
export function importLimitReached(): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    {
      code: 'ANIME_IMPORT_LIMIT_REACHED',
      message:
        'Too many new anime are being imported right now. Try again in a moment.',
    },
    { retryAfterSeconds: IMPORT_REFILL_MS / 1000 },
  );
}

/** This visitor's cap: Retry-After is the seconds until its next token, 1 to 40 (ADR 0019). */
export function visitorImportLimitReached(
  retryAfterSeconds: number,
): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    {
      code: 'ANIME_IMPORT_VISITOR_LIMIT_REACHED',
      message:
        'You opened many new anime in a short time. Try again in a moment.',
    },
    { retryAfterSeconds },
  );
}

/** The source's own id first, so a refresh always asks about the same entry. */
function refreshRef(
  anime: StoredAnime,
  adapter: AnimeSourceAdapter,
): AnimeRef | undefined {
  return (
    anime.externalIds.find((id) => id.source === adapter.idSource) ??
    anime.externalIds.find((id) => adapter.lookups.includes(id.source))
  );
}

export function animeNotFound(
  message = 'No anime with this id.',
): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, {
    code: 'ANIME_NOT_FOUND',
    message,
  });
}

export function isPrismaError(error: unknown, code: string): boolean {
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
export class AnimeImportService implements OnModuleDestroy {
  private readonly logger = new Logger(AnimeImportService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /**
   * When a source last said "not found" for an anime: no new call before the TTL, so an anime
   * Jikan does not know does not cost a Jikan call per page view. In memory: a restart forgets
   * it, which only costs one extra call per anime.
   */
  private readonly notFoundAt = new Map<string, number>();
  /** When the import cap was last logged: one warning per minute at most. */
  private limitWarnedAt = Number.NEGATIVE_INFINITY;
  /** Same for the per-visitor cap: one warning per minute for all known visitors together. */
  private visitorLimitWarnedAt = Number.NEGATIVE_INFINITY;
  /** The shared `unknown` key has its own: a missing client IP must not hide behind a visitor. */
  private unknownVisitorLimitWarnedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
    private readonly settings: AnimeSourceSettings,
    @Inject(ANIME_SOURCE_ADAPTERS)
    private readonly adapters: readonly AnimeSourceAdapter[],
    private readonly backoff: SourceBackoff,
    private readonly limits: ImportLimits,
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
  async onModuleDestroy(): Promise<void> {
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
   *
   * ADR 0019 item 9: joining an import already running for this id is free. Otherwise a `web`
   * caller's visitor token is taken before the shared import starts, so a 429 goes only to the
   * visitor who caused it and never to others waiting on the same id; an `open` caller has no
   * visitor bucket. The global token comes after, inside the import.
   */
  importNew(ref: AnimeRef, caller: ApiCaller): Promise<string> {
    const key = `import:${ref.source}:${ref.externalId}`;
    const running = this.inFlight.get(key);
    if (running) return running as Promise<string>;
    const visitorKey = visitorKeyOf(caller);
    if (visitorKey !== null) {
      const take = this.limits.takeVisitorToken(visitorKey);
      if (!take.taken) {
        this.warnVisitorLimitReached(visitorKey);
        return Promise.reject(
          visitorImportLimitReached(take.retryAfterSeconds),
        );
      }
    }
    // No await since the in-flight check: this call starts the one shared import.
    return this.shared(key, () => this.runImport(ref, visitorKey));
  }

  /** Starts background refreshes for the enabled sources whose data is missing or stale. */
  refreshStale(anime: StoredAnime): void {
    for (const adapter of this.staleAdapters(anime)) {
      this.shared(`refresh:${anime.id}:${adapter.source}`, () =>
        this.refreshFrom(anime, adapter, 'background'),
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
    const ttl = refreshTtlMs(
      mergeAnime(anime, this.isEnabled, now).status?.value,
    );
    return this.enabledAdapters().filter((adapter) => {
      // A source cooling down after a failure is skipped, not retried on every view.
      if (adapter.isDown()) return false;
      const missedAt = this.notFoundAt.get(`${anime.id}:${adapter.source}`);
      if (missedAt !== undefined && now.getTime() - missedAt < ttl)
        return false;
      // Backed off after an unusable answer: not even tried (and not logged) until it ends.
      const ref = refreshRef(anime, adapter);
      if (
        ref &&
        this.backoff.isBackedOff(backoffKey('anime', adapter.source, ref))
      )
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

  /**
   * ADR 0019 item 10: a token is spent only when a source request was sent. Otherwise (stored,
   * known missing, removed, no source, global bucket empty, every source refused before sending,
   * or a database error first) the visitor token comes back, and the global one if it was taken.
   */
  private async runImport(
    ref: AnimeRef,
    visitorKey: VisitorKey | null,
  ): Promise<string> {
    let globalTaken = false;
    let requestSent = false;
    try {
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
      if (this.limits.isKnownMissing(ref)) throw animeNotFound();
      // ADR 0007: a removed anime costs no source call, however often its URL is hit.
      if (await this.isRemoved([ref])) throw animeNotFound();
      const candidates = this.enabledAdapters().filter((adapter) =>
        adapter.lookups.includes(ref.source),
      );
      if (candidates.length === 0) throw animeNotFound();
      if (!this.limits.takeImportToken()) {
        this.warnImportLimitReached();
        throw importLimitReached();
      }
      globalTaken = true;
      let unavailable = false;
      for (const adapter of candidates) {
        let result;
        try {
          result = await this.fetchFrom(adapter, ref);
        } catch (error) {
          // Only a refusal before the first attempt left nothing at the source.
          if (
            !(error instanceof SourceUnavailableError) ||
            !refusedBeforeSending(error)
          ) {
            requestSent = true;
          }
          if (!(error instanceof SourceUnavailableError)) throw error;
          // A refusal before sending costs nothing now: logging each one would flood the logs.
          if (!refusedBeforeSending(error)) this.logger.warn(error.message);
          unavailable = true;
          continue;
        }
        requestSent = true;
        if (result.kind === 'not_found') continue;
        // Adult entries are neither stored nor shown (ADR 0006 update): same answer as unknown.
        if (result.snapshot.adult) {
          await this.remove(null, result.snapshot.ids);
          this.limits.rememberMissing(ref);
          throw animeNotFound();
        }
        const animeId = await this.store(adapter, result.snapshot);
        // Registered before this import ends, so settle() never sees a gap between the two.
        void this.shared(`fill:${animeId}`, () => this.fillFromOthers(animeId));
        return animeId;
      }
      if (unavailable) throw sourceNotAvailable();
      this.limits.rememberMissing(ref);
      throw animeNotFound();
    } finally {
      if (!requestSent) {
        if (visitorKey !== null) this.limits.giveBackVisitorToken(visitorKey);
        if (globalTaken) this.limits.giveBackImportToken();
      }
    }
  }

  private warnImportLimitReached(): void {
    const now = this.clock.now().getTime();
    if (now - this.limitWarnedAt < LIMIT_WARN_INTERVAL_MS) return;
    this.limitWarnedAt = now;
    this.logger.warn('Cold anime import cap reached: new imports are refused.');
  }

  /** Never logs the visitor key: it is a client IP (ADR 0019). Only whether it was the shared one. */
  private warnVisitorLimitReached(visitorKey: VisitorKey): void {
    const now = this.clock.now().getTime();
    if (visitorKey === UNKNOWN_VISITOR_KEY) {
      if (now - this.unknownVisitorLimitWarnedAt < LIMIT_WARN_INTERVAL_MS) {
        return;
      }
      this.unknownVisitorLimitWarnedAt = now;
      this.logger.warn(
        'Visitor import cap reached on the shared unknown visitor: web calls may arrive without a client IP.',
      );
      return;
    }
    if (now - this.visitorLimitWarnedAt < LIMIT_WARN_INTERVAL_MS) return;
    this.visitorLimitWarnedAt = now;
    this.logger.warn(
      "Visitor import cap reached: one visitor's new imports are refused.",
    );
  }

  /**
   * One source call, unless this entry is backed off after an unusable answer (ADR 0008): an
   * entry AniList keeps answering without isAdult costs a request after 1 h, 6 h, 1 d, then weekly,
   * not one per view.
   */
  private async fetchFrom(
    adapter: AnimeSourceAdapter,
    ref: AnimeRef,
    priority: FetchPriority = 'interactive',
  ): Promise<SourceResult> {
    const key = backoffKey('anime', adapter.source, ref);
    if (this.backoff.isBackedOff(key)) {
      throw new SourceUnavailableError(adapter.source, BACKED_OFF_REASON);
    }
    try {
      const result = await adapter.fetchAnime(ref, priority);
      this.backoff.clear(key);
      return result;
    } catch (error) {
      if (error instanceof UnusableAnswerError) this.backoff.backOff(key);
      throw error;
    }
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
    priority: FetchPriority = 'interactive',
  ): Promise<RefreshOutcome> {
    const ref = refreshRef(anime, adapter);
    if (!ref) return 'skipped';
    let result;
    try {
      result = await this.fetchFrom(adapter, ref, priority);
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
    // Flagged adult by any source, or stored through another source after its removal
    // (ADR 0007): the whole anime goes, ids and snapshots by cascade.
    const ids = [...anime.externalIds, ...result.snapshot.ids];
    if (result.snapshot.adult || (await this.isRemoved(ids))) {
      await this.remove(anime.id, ids);
      return 'removed';
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
   * that anime; so does a slug taken by a concurrent import (ADR 0007). A purge deleting it
   * mid-way (P2003) is retried too.
   */
  private async store(
    adapter: AnimeSourceAdapter,
    snapshot: AnimeSnapshot,
    animeId?: string,
    attempt = 1,
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
        if (own.source === 'anilist') {
          await this.claimSlugs(tx, snapshot, own.externalId, now);
        }
        return id;
      });
    } catch (error) {
      const retryable =
        isPrismaError(error, 'P2002') ||
        (!animeId && isPrismaError(error, 'P2003'));
      if (attempt < STORE_ATTEMPTS && retryable) {
        return this.store(adapter, snapshot, animeId, attempt + 1);
      }
      throw error;
    }
  }

  /** ADR 0007: true when one of these ids is an AniList anime removed for good. */
  private async isRemoved(ids: readonly AnimeRef[]): Promise<boolean> {
    const anilist = ids.find((id) => id.source === 'anilist');
    if (!anilist) return false;
    const identity = await this.prisma.animeIdentity.findUnique({
      where: { anilistId: anilist.externalId },
    });
    return (identity?.removedAt ?? null) !== null;
  }

  /**
   * Deletes the anime (when stored) and marks its identity removed in one transaction, so no
   * import can store it again in between. Its slugs stay. An anime with no identity yet (never
   * slugged) cannot be marked: the adult flag is checked again on every import anyway.
   */
  private async remove(
    animeId: string | null,
    ids: readonly AnimeRef[],
  ): Promise<void> {
    const anilist = ids.find((id) => id.source === 'anilist');
    await this.prisma.$transaction([
      ...(animeId === null
        ? []
        : [this.prisma.anime.deleteMany({ where: { id: animeId } })]),
      ...(anilist === undefined
        ? []
        : [
            this.prisma.animeIdentity.updateMany({
              where: { anilistId: anilist.externalId, removedAt: null },
              data: { removedAt: this.clock.now() },
            }),
          ]),
    ]);
  }

  /**
   * ADR 0007: keeps the canonical slug while it is still a candidate, or while the snapshot has
   * no usable English title (a title that disappears never moves it, so a reverted edit claims
   * nothing). Otherwise moves it to the first candidate that is free or already this anime's
   * (the old one keeps redirecting); then adds the romaji alias when free. A candidate taken by a concurrent import fails the plain
   * insert (P2002), and store() tries again with fresh data.
   */
  private async claimSlugs(
    tx: Prisma.TransactionClient,
    snapshot: AnimeSnapshot,
    anilistId: number,
    now: Date,
  ): Promise<void> {
    const source = slugSource(anilistId, snapshot);
    const identity = await tx.animeIdentity.findUnique({
      where: { anilistId },
    });
    if (identity?.removedAt) throw animeNotFound();
    const candidates = canonicalCandidates(source);
    const moves =
      identity === null ||
      (!candidates.includes(identity.canonicalSlug) &&
        slugify(source.titleEnglish ?? '') !== '');
    if (moves) {
      const taken = await tx.animeSlug.findMany({
        where: { slug: { in: candidates } },
      });
      const owner = new Map(taken.map((row) => [row.slug, row.anilistId]));
      const slug = pickCanonical(candidates, owner, anilistId);
      if (slug === undefined) {
        throw new Error(`No free slug for AniList ${anilistId}`);
      }
      await tx.animeIdentity.upsert({
        where: { anilistId },
        create: { anilistId, canonicalSlug: slug, createdAt: now },
        update: { canonicalSlug: slug },
      });
      if (!owner.has(slug)) {
        await tx.animeSlug.create({
          data: { slug, anilistId, createdAt: now },
        });
      }
    }
    const alias = romajiAlias(source);
    if (alias !== null) {
      await tx.animeSlug.createMany({
        data: [{ slug: alias, anilistId, createdAt: now }],
        skipDuplicates: true,
      });
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
