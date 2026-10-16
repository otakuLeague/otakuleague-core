import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { PURGE_AFTER_MS, refreshTtlMs } from './cache-ttl';
import {
  NODE_CAP,
  traverseFranchise,
  type TraversalState,
} from './franchise-graph';
import { fromRelationRow, toRelationRow } from './relation.rows';
import { backoffKey, SourceBackoff } from './source-backoff';
import { AniListAdapter, RELATIONS_PAGE_SIZE } from './sources/anilist.adapter';
import { AnimeSourceSettings } from './sources/source-settings';
import {
  type RelationNode,
  SourceUnavailableError,
} from './sources/source.types';

/** The backoff key of an AniList id in relations answers (shared with the read path). */
export function relationsKey(anilistId: number): string {
  return backoffKey('relations', 'anilist', {
    source: 'anilist',
    externalId: anilistId,
  });
}

/** Tries per request when no AniList slot is free: one slot interval apart. */
const QUEUE_FULL_ATTEMPTS = 5;
/** Walks waiting at most; more are dropped (logged) and asked again by a later view. */
const MAX_PENDING = 100;

/**
 * Walks franchises in the background (ADR 0008): from one AniList anime along the edges
 * traverseFranchise follows, through any format, up to NODE_CAP entries, storing each entry's
 * summary and edges in anime_relation_node. Rows still fresh are reused without a request.
 * One walk at a time per process (known limit: no per-franchise single-flight; add it if
 * overlapping walks ever matter). It never runs during a page request, and stops at module
 * destroy, before Prisma disconnects, waiting only for the request in flight.
 */
@Injectable()
export class FranchiseWalker implements OnModuleDestroy {
  private readonly logger = new Logger(FranchiseWalker.name);
  /** Start ids in arrival order. */
  private readonly pending = new Set<number>();
  private current: number | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: AnimeSourceSettings,
    private readonly anilist: AniListAdapter,
    private readonly backoff: SourceBackoff,
  ) {}

  /** Queues a walk from this AniList anime, unless it is already queued or walking. */
  request(anilistId: number): void {
    if (
      this.stopping ||
      anilistId === this.current ||
      this.pending.has(anilistId)
    ) {
      return;
    }
    if (this.pending.size >= MAX_PENDING) {
      this.logger.warn(
        `Franchise walk queue full (${MAX_PENDING}): dropped AniList ${anilistId}`,
      );
      return;
    }
    this.pending.add(anilistId);
    this.start();
  }

  /** Resolves once every queued walk has ended. */
  async settle(): Promise<void> {
    while (this.running) await this.running;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.settle();
  }

  /**
   * Deletes walked rows no franchise view used for 30 days (ADR 0006 purge). One statement,
   * unlike the anime purge's batches: the table is bounded by the node cap per franchise
   * viewed in the last 30 days, and it has no foreign keys to cascade.
   */
  async purgeUnused(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - PURGE_AFTER_MS);
    const { count } = await this.prisma.animeRelationNode.deleteMany({
      where: { lastUsedAt: { lt: cutoff } },
    });
    return count;
  }

  /**
   * One walk: traverseFranchise with a loader that reuses fresh rows and fetches the others.
   * An id missing from AniList's answer ends the walk `missing`; it is not walked through, is
   * backed off for a week (SourceBackoff) and never treated as deleted.
   */
  async walk(startId: number, nodeCap = NODE_CAP): Promise<TraversalState> {
    const boundaries = new Set(
      (
        await this.prisma.animeFranchiseOverride.findMany({
          where: { role: 'BOUNDARY' },
          select: { anilistId: true },
        })
      ).map(({ anilistId }) => anilistId),
    );
    const { state } = await traverseFranchise(
      startId,
      (ids) => (this.stopping ? Promise.resolve(null) : this.load(ids)),
      boundaries,
      nodeCap,
    );
    return state;
  }

  private start(): void {
    this.running ??= this.drain().finally(() => {
      this.running = null;
      // A walk queued while the last one was finishing.
      if (this.pending.size > 0 && !this.stopping) this.start();
    });
  }

  private async drain(): Promise<void> {
    while (!this.stopping) {
      const next = this.pending.values().next();
      if (next.done === true) return;
      this.pending.delete(next.value);
      this.current = next.value;
      try {
        await this.walk(next.value);
      } catch (error) {
        this.logger.warn(
          `Franchise walk from AniList ${next.value} stopped: ${String(error)}`,
        );
      } finally {
        this.current = null;
      }
    }
  }

  /**
   * The level's entries: fresh rows as stored, the others fetched and upserted one batch at a
   * time, so a later failing batch keeps the earlier ones. Stopped when the rest cannot be
   * fetched now (AniList switched off or cooling down, or shutdown).
   */
  private async load(ids: readonly number[]): Promise<RelationNode[] | null> {
    const now = this.clock.now();
    const rows = await this.prisma.animeRelationNode.findMany({
      where: { anilistId: { in: [...ids] } },
    });
    const fresh = rows
      .filter(
        (row) =>
          now.getTime() - row.fetchedAt.getTime() < refreshTtlMs(row.status),
      )
      .map(fromRelationRow);
    const freshIds = new Set(fresh.map(({ anilistId }) => anilistId));
    // An id AniList left out lately is not asked again before its backoff ends.
    const missing = ids.filter(
      (id) => !freshIds.has(id) && !this.backoff.isBackedOff(relationsKey(id)),
    );
    const fetched: RelationNode[] = [];
    for (let at = 0; at < missing.length; at += RELATIONS_PAGE_SIZE) {
      if (!this.canFetch()) return null;
      const asked = missing.slice(at, at + RELATIONS_PAGE_SIZE);
      const batch = await this.fetchBatch(asked);
      const answered = new Set(batch.map(({ anilistId }) => anilistId));
      for (const id of asked) {
        if (!answered.has(id)) this.backoff.backOff(relationsKey(id));
      }
      await this.store(batch, now);
      fetched.push(...batch);
    }
    return [...fresh, ...fetched];
  }

  /** One upsert per row, in id order: these cache rows need no transaction, and a fixed order
   * keeps two processes refreshing the same rows from deadlocking. */
  private async store(
    nodes: readonly RelationNode[],
    now: Date,
  ): Promise<void> {
    for (const node of nodes.toSorted((a, b) => a.anilistId - b.anilistId)) {
      await this.prisma.animeRelationNode.upsert({
        where: { anilistId: node.anilistId },
        create: {
          anilistId: node.anilistId,
          lastUsedAt: now,
          ...toRelationRow(node, now),
        },
        update: toRelationRow(node, now),
      });
    }
  }

  private canFetch(): boolean {
    return (
      !this.stopping &&
      this.settings.get('anilist').enabled &&
      !this.anilist.isDown()
    );
  }

  /** fetchRelations takes only a free slot: when none is, wait one interval and try again. */
  private async fetchBatch(ids: readonly number[]): Promise<RelationNode[]> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.anilist.fetchRelations(ids);
      } catch (error) {
        const queueFull =
          error instanceof SourceUnavailableError &&
          error.reason === 'queue full';
        if (!queueFull || attempt >= QUEUE_FULL_ATTEMPTS || this.stopping) {
          throw error;
        }
        await sleep(this.settings.get('anilist').minIntervalMs);
      }
    }
  }
}
