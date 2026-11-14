import { Injectable } from '@nestjs/common';
import type {
  AnimeFranchise,
  FranchiseEntry as FranchiseEntryResponse,
  FranchiseSeason,
} from '@otakuleague/shared-types';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { animeNotFound } from './anime-import.service';
import { findImportedAnilistIds } from './imported-anime';
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
 * an id AniList left out is backed off (1 h, 6 h, 1 d, then a week if it keeps happening), so it
 * neither keeps the franchise `walking` nor queues a walk on every view; while it is on an
 * early step the franchise is `partial`.
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
    const stages = traversal.missingIds.map((id) =>
      this.backoff.stage(relationsKey(id)),
    );
    const awaited = stages.includes('clear');
    // The start without a row is in missingIds: awaited, unless backed off.
    if (stale || awaited) {
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
    const [identities, imported] = await Promise.all([
      this.prisma.animeIdentity.findMany({
        where: { anilistId: { in: shownIds } },
        select: { anilistId: true, canonicalSlug: true, removedAt: true },
      }),
      findImportedAnilistIds(this.prisma, shownIds),
    ]);
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
      traversal,
      missingStages: stages,
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
      imported: entry.mediaType === 'ANIME' && imported.has(entry.anilistId),
    });
    // The anime being viewed is always in its own main line (owner decision): with no
    // relation row yet, from its core record, alone, so the selector hides itself.
    const startHasRow = traversal.nodes.some(
      ({ anilistId }) => anilistId === startId,
    );
    const mainLine = startHasRow
      ? view.mainLine.map((season) => ({
          ...withSlug(season),
          label: season.label,
          isCurrent: season.isCurrent,
        }))
      : await this.currentFromCore(startId, owner.identity.canonicalSlug);
    return {
      state: view.state,
      mainLine,
      related: view.related.map((group) => ({
        group: group.group,
        entries: group.entries.map(withSlug),
        total: group.total,
      })),
    };
  }

  /**
   * The viewed anime as its only season, from its AniList snapshot; nothing when it is not
   * cached (the page route imports it before the selector asks).
   */
  private async currentFromCore(
    anilistId: number,
    slug: string,
  ): Promise<FranchiseSeason[]> {
    const snapshot = await this.prisma.animeSourceSnapshot.findFirst({
      where: {
        source: 'ANILIST',
        anime: {
          externalIds: { some: { source: 'ANILIST', externalId: anilistId } },
        },
      },
    });
    if (!snapshot) return [];
    return [
      {
        anilistId,
        mediaType: 'ANIME',
        slug,
        imported: true,
        title:
          snapshot.titleEnglish ??
          snapshot.titleRomaji ??
          `AniList ${anilistId}`,
        format: snapshot.format,
        status: snapshot.status,
        startDate:
          snapshot.startYear === null
            ? null
            : {
                year: snapshot.startYear,
                month: snapshot.startMonth,
                day: snapshot.startDay,
              },
        coverImageUrl: snapshot.coverImageUrl,
        label: 'Season 1',
        isCurrent: true,
      },
    ];
  }
}
