import { Injectable } from '@nestjs/common';
import type {
  AnimeFranchise,
  FranchiseEntry as FranchiseEntryResponse,
} from '@otakuleague/shared-types';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { animeNotFound } from './anime-import.service';
import { refreshTtlMs } from './cache-ttl';
import { traverseFranchise } from './franchise-graph';
import {
  buildFranchise,
  type FranchiseEntry,
  type FranchiseOverride,
} from './franchise-view';
import { FranchiseWalker, relationsKey } from './franchise-walker.service';
import { fromRelationRow } from './relation.rows';
import { SourceBackoff } from './source-backoff';
import { AnimeSourceSettings } from './sources/source-settings';

/** last_used_at only drives the 30-day purge: one write per hour per row is plenty. */
const USE_WRITE_INTERVAL_MS = 60 * 60 * 1000;

const UNAVAILABLE: AnimeFranchise = {
  state: 'unavailable',
  mainLine: [],
  related: [],
};

/**
 * GET /anime/slugs/:slug/franchise (ADR 0008 item 9): the franchise from the stored rows,
 * never a source call during the request. A walk is queued when rows are missing or stale;
 * an id AniList keeps leaving out is backed off, so it neither keeps the franchise `walking`
 * nor queues a walk on every view.
 */
@Injectable()
export class AnimeFranchiseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: AnimeSourceSettings,
    private readonly walker: FranchiseWalker,
    private readonly backoff: SourceBackoff,
  ) {}

  /** Any slug of the anime answers (no redirect: the page route handles those). */
  async getBySlug(slug: string): Promise<AnimeFranchise> {
    const owner = await this.prisma.animeSlug.findUnique({
      where: { slug: slug.toLowerCase() },
      include: { identity: true },
    });
    if (!owner || owner.identity.removedAt !== null) {
      throw animeNotFound('No anime with this slug.');
    }
    // All franchise data is AniList data: hidden, not deleted, while it is switched off.
    if (!this.settings.get('anilist').enabled) return UNAVAILABLE;

    const startId = owner.anilistId;
    const now = this.clock.now();
    const overrideRows = await this.prisma.animeFranchiseOverride.findMany({
      select: { anilistId: true, role: true, label: true },
    });
    const overrides = new Map<number, FranchiseOverride>(
      overrideRows.map(({ anilistId, role, label }) => [
        anilistId,
        { role, label },
      ]),
    );
    const boundaries = new Set(
      overrideRows
        .filter(({ role }) => role === 'BOUNDARY')
        .map(({ anilistId }) => anilistId),
    );
    let stale = false;
    const traversal = await traverseFranchise(
      startId,
      async (ids) => {
        const rows = await this.prisma.animeRelationNode.findMany({
          where: { anilistId: { in: [...ids] } },
          orderBy: { anilistId: 'asc' },
        });
        // A stale row whose refetch is backed off is not worth a walk until the backoff ends.
        stale ||= rows.some(
          (row) =>
            now.getTime() - row.fetchedAt.getTime() >=
              refreshTtlMs(row.status) &&
            !this.backoff.isBackedOff(relationsKey(row.anilistId)),
        );
        return rows.map(fromRelationRow);
      },
      boundaries,
    );
    const awaited = traversal.missingIds.filter(
      (id) => !this.backoff.isBackedOff(relationsKey(id)),
    );
    // The start without a row is in missingIds: awaited, unless backed off.
    if (stale || awaited.length > 0) {
      this.walker.request(startId);
    }

    const shownIds = [
      ...new Set(
        traversal.nodes.flatMap(({ anilistId, edges }) => [
          anilistId,
          ...edges.map(({ target }) => target.anilistId),
        ]),
      ),
    ];
    const identities = await this.prisma.animeIdentity.findMany({
      where: { anilistId: { in: shownIds } },
      select: { anilistId: true, canonicalSlug: true, removedAt: true },
    });
    const removed = new Set(
      identities
        .filter(({ removedAt }) => removedAt !== null)
        .map(({ anilistId }) => anilistId),
    );
    const slugs = new Map(
      identities
        .filter(({ removedAt }) => removedAt === null)
        .map(({ anilistId, canonicalSlug }) => [anilistId, canonicalSlug]),
    );

    const view = buildFranchise({
      startId,
      // Ids left out and backed off are known to be absent for now, not still coming.
      traversal:
        traversal.state === 'missing' && awaited.length === 0
          ? { ...traversal, state: 'complete' }
          : traversal,
      boundaries,
      overrides,
      removed,
    });
    await this.prisma.animeRelationNode.updateMany({
      where: {
        anilistId: { in: shownIds },
        lastUsedAt: { lt: new Date(now.getTime() - USE_WRITE_INTERVAL_MS) },
      },
      data: { lastUsedAt: now },
    });

    const withSlug = (entry: FranchiseEntry): FranchiseEntryResponse => ({
      ...entry,
      slug:
        entry.mediaType === 'ANIME'
          ? (slugs.get(entry.anilistId) ?? null)
          : null,
    });
    return {
      state: view.state,
      mainLine: view.mainLine.map((season) => ({
        ...withSlug(season),
        label: season.label,
        isCurrent: season.isCurrent,
      })),
      related: view.related.map((group) => ({
        group: group.group,
        entries: group.entries.map(withSlug),
        total: group.total,
      })),
    };
  }
}
