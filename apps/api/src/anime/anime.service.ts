import { Injectable } from '@nestjs/common';
import type { AnimeDetails } from '@otakuleague/shared-types';
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

  /**
   * The core anime, from our database. A new anime is imported first (one shared import per
   * anime); a known one is served at once, stale or not, and refreshed in the background, so
   * a source outage never breaks a page that has data.
   */
  async getByExternalId(ref: AnimeRef): Promise<AnimeDetails> {
    let anime = await this.find(ref);
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
    if (
      now.getTime() - anime.lastViewedAt.getTime() >=
      VIEW_WRITE_INTERVAL_MS
    ) {
      await this.prisma.anime.updateMany({
        where: { id: anime.id },
        data: { lastViewedAt: now },
      });
    }
    return mergeAnime(anime, this.importer.isEnabled, now);
  }

  private hasEnabledData(anime: StoredAnime): boolean {
    return anime.snapshots.some((snapshot) =>
      this.importer.isEnabled(snapshot.source),
    );
  }

  /** The anime this id points to, if a switched-on source vouches for that id. */
  private async find(ref: AnimeRef): Promise<StoredAnime | null> {
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
    if (!row) return null;
    const anime = fromAnimeRow(row);
    // With no enabled data at all, keep it: refreshMissing then asks the enabled sources.
    return visibleIdSources(anime, this.importer.isEnabled).has(ref.source) ||
      !this.hasEnabledData(anime)
      ? anime
      : null;
  }
}
