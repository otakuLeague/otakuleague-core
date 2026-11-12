import { Injectable } from '@nestjs/common';
import type {
  AnimeBySlug,
  AnimeDetails,
  AnimeSlugResolution,
} from '@otakuleague/shared-types';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  animeNotFound,
  AnimeImportService,
  sourceNotAvailable,
} from './anime-import.service';
import { mergeAnime, type StoredAnime, visibleIdSources } from './anime.merge';
import { ANIME_WITH_DATA, DB_ID_SOURCE, fromAnimeRow } from './anime.rows';
import type { AnimeRef } from './sources/source.types';

/** lastViewedAt only drives the 30-day purge: one write per hour per anime is plenty. */
const VIEW_WRITE_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class AnimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly importer: AnimeImportService,
  ) {}

  /** The core anime by a source id, when a switched-on source vouches for that id. */
  async getByExternalId(ref: AnimeRef): Promise<AnimeDetails> {
    const anime = await this.findStored(ref);
    // With no enabled data at all, keep it: serve() then asks the enabled sources.
    const vouched =
      anime !== null &&
      (visibleIdSources(anime, this.importer.isEnabled).has(ref.source) ||
        !this.hasEnabledData(anime));
    return this.serve(vouched ? anime : null, ref, 'id_lookup');
  }

  /**
   * Which anime a slug names, any letter case, from the database only: never an import or a
   * source call, so it stays fast for a purged anime too (OTA-97).
   */
  async resolveSlug(requested: string): Promise<AnimeSlugResolution> {
    const slug = await this.prisma.animeSlug.findUnique({
      where: { slug: requested.toLowerCase() },
      include: { identity: true },
    });
    if (!slug || slug.identity.removedAt !== null) {
      throw animeNotFound('No anime with this slug.');
    }
    return {
      anilistId: slug.anilistId,
      canonicalSlug: slug.identity.canonicalSlug,
    };
  }

  /**
   * ADR 0007: the canonical slug serves the anime; any other slug of the same anime (alias,
   * former canonical, other letter case) answers a redirect. Resolved through the AniList
   * identity, not through a source's ids, so a switched-off source never breaks the slug of a
   * cached anime.
   */
  async getBySlug(requested: string): Promise<AnimeBySlug> {
    // One lookup rule for the proxy (resolve) and the page (this).
    const { anilistId, canonicalSlug } = await this.resolveSlug(requested);
    if (requested !== canonicalSlug) return { kind: 'redirect', canonicalSlug };
    const ref: AnimeRef = { source: 'anilist', externalId: anilistId };
    const anime = await this.serve(
      await this.findStored(ref),
      ref,
      'page_view',
    );
    // A re-import can move the canonical (its title changed while it was purged).
    return anime.canonicalSlug !== null && anime.canonicalSlug !== requested
      ? { kind: 'redirect', canonicalSlug: anime.canonicalSlug }
      : { kind: 'anime', anime };
  }

  /**
   * A new anime is imported first (one shared import per anime); a known one is served at
   * once, stale or not, and refreshed in the background, so a source outage never breaks a
   * page that has data.
   */
  private async serve(
    stored: StoredAnime | null,
    ref: AnimeRef,
    access: 'page_view' | 'id_lookup',
  ): Promise<AnimeDetails> {
    let anime = stored;
    if (!anime) {
      // No enabled source can resolve this kind of id (e.g. AniList switched off).
      if (!this.importer.canLookUp(ref)) throw animeNotFound();
      anime = await this.importer.loadStored(
        await this.importer.importNew(ref),
      );
      if (!anime) throw animeNotFound();
    } else if (!this.hasEnabledData(anime)) {
      // Everything it has comes from switched-off sources: ask the enabled ones now.
      const outcomes = await this.importer.refreshMissing(anime);
      anime = await this.importer.loadStored(anime.id);
      if (!anime || !this.hasEnabledData(anime)) {
        throw outcomes.includes('unavailable')
          ? sourceNotAvailable()
          : animeNotFound();
      }
    } else {
      this.importer.refreshStale(anime);
    }
    const now = this.clock.now();
    // Only a page a person reads keeps an anime alive; walking ids does not (OTA-173).
    if (
      access === 'page_view' &&
      now.getTime() - anime.lastViewedAt.getTime() >= VIEW_WRITE_INTERVAL_MS
    ) {
      await this.prisma.anime.updateMany({
        where: { id: anime.id },
        data: { lastViewedAt: now },
      });
    }
    return {
      ...mergeAnime(anime, this.importer.isEnabled, now),
      canonicalSlug: await this.canonicalSlugOf(anime),
    };
  }

  /** Null for an anime with no AniList identity yet (no slug claimed). */
  private async canonicalSlugOf(anime: StoredAnime): Promise<string | null> {
    const anilist = anime.externalIds.find(
      ({ source }) => source === 'anilist',
    );
    if (!anilist) return null;
    const identity = await this.prisma.animeIdentity.findUnique({
      where: { anilistId: anilist.externalId },
    });
    return identity?.removedAt === null ? identity.canonicalSlug : null;
  }

  private hasEnabledData(anime: StoredAnime): boolean {
    return anime.snapshots.some((snapshot) =>
      this.importer.isEnabled(snapshot.source),
    );
  }

  private async findStored(ref: AnimeRef): Promise<StoredAnime | null> {
    const row = await this.prisma.anime.findFirst({
      where: {
        externalIds: {
          some: {
            source: DB_ID_SOURCE[ref.source],
            externalId: ref.externalId,
          },
        },
      },
      include: ANIME_WITH_DATA,
    });
    return row ? fromAnimeRow(row) : null;
  }
}
