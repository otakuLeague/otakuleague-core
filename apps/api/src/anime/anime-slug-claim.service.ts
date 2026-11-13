import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaError } from './anime-import.service';
import {
  canonicalCandidates,
  pickCanonical,
  romajiAlias,
  slugSource,
} from './anime.slug';
import type { ListedAnime } from './sources/source.types';

/** A claim that loses a race (unique violation) is read again and retried this often. */
const CLAIM_ATTEMPTS = 3;

/**
 * ADR 0016 (slice 3): gives the anime of a stored list page an identity, a canonical slug and
 * its romaji alias, from the page's own titles: no anime row, no source call. An anime that
 * already has an identity (imported, claimed by another list, removed) is left as it is. One
 * transaction per anime, in list order; a failed claim leaves the slug null until the next
 * fetch of a page that lists it. Never throws: the list answer does not depend on it.
 */
@Injectable()
export class AnimeSlugClaimService {
  private readonly logger = new Logger(AnimeSlugClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async claimListed(entries: readonly ListedAnime[]): Promise<void> {
    const failed: number[] = [];
    try {
      const unclaimed = await this.unclaimed(entries);
      for (const entry of unclaimed) {
        try {
          await this.claimWithRetry(entry);
        } catch {
          failed.push(entry.anilistId);
        }
      }
    } catch {
      failed.push(...entries.map(({ anilistId }) => anilistId));
    }
    if (failed.length > 0) {
      this.logger.warn(
        `Slug claim failed for ${failed.length} listed anime: ${failed.join(', ')}`,
      );
    }
  }

  /** Listed anime without an identity, each id once, in list order. */
  private async unclaimed(
    entries: readonly ListedAnime[],
  ): Promise<ListedAnime[]> {
    if (entries.length === 0) return [];
    const known = await this.prisma.animeIdentity.findMany({
      where: { anilistId: { in: entries.map(({ anilistId }) => anilistId) } },
      select: { anilistId: true },
    });
    const skip = new Set(known.map(({ anilistId }) => anilistId));
    return entries.filter(({ anilistId }) => {
      if (skip.has(anilistId)) return false;
      skip.add(anilistId);
      return true;
    });
  }

  private async claimWithRetry(
    entry: ListedAnime,
    attempt = 1,
  ): Promise<void> {
    try {
      await this.prisma.$transaction((tx) => this.claim(tx, entry));
    } catch (error) {
      if (attempt < CLAIM_ATTEMPTS && isPrismaError(error, 'P2002')) {
        return this.claimWithRetry(entry, attempt + 1);
      }
      throw error;
    }
  }

  /** Reads the identity again inside the transaction, so a retry that lost to a winner stops. */
  private async claim(
    tx: Prisma.TransactionClient,
    entry: ListedAnime,
  ): Promise<void> {
    const { anilistId } = entry;
    const existing = await tx.animeIdentity.findUnique({ where: { anilistId } });
    if (existing !== null) return;
    const source = slugSource(anilistId, entry);
    const candidates = canonicalCandidates(source);
    const taken = await tx.animeSlug.findMany({
      where: { slug: { in: candidates } },
    });
    const owners = new Map(taken.map((row) => [row.slug, row.anilistId]));
    const slug = pickCanonical(candidates, owners, anilistId);
    if (slug === undefined) {
      throw new Error(`No free slug for AniList ${anilistId}`);
    }
    const now = this.clock.now();
    await tx.animeIdentity.create({
      data: { anilistId, canonicalSlug: slug, createdAt: now },
    });
    if (!owners.has(slug)) {
      await tx.animeSlug.create({ data: { slug, anilistId, createdAt: now } });
    }
    const alias = romajiAlias(source);
    if (alias !== null) {
      await tx.animeSlug.createMany({
        data: [{ slug: alias, anilistId, createdAt: now }],
        skipDuplicates: true,
      });
    }
  }
}
