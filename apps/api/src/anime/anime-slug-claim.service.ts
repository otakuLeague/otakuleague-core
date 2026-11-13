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

class NoFreeSlugError extends Error {
  constructor(anilistId: number) {
    super(`No free slug for AniList ${anilistId}`);
    this.name = 'NoFreeSlugError';
  }
}

/** A unique violation or a write conflict: another claim got there first. */
function isLostRace(error: unknown): boolean {
  return isPrismaError(error, 'P2002') || isPrismaError(error, 'P2034');
}

/** Failures that belong to one anime: the loop goes on. Anything else stops it. */
function isExpectedClaimFailure(error: unknown): boolean {
  return error instanceof NoFreeSlugError || isLostRace(error);
}

/** Name and Prisma code only: a message can carry values from the query. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code =
    'code' in error && typeof error.code === 'string' ? ` ${error.code}` : '';
  return `${error.name}${code}`;
}

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
    let unclaimed: ListedAnime[];
    try {
      unclaimed = await this.unclaimed(entries);
    } catch (error) {
      this.logger.warn(`Slug claim lookup failed: ${describeError(error)}`);
      return;
    }
    const failed: number[] = [];
    const notAttempted: number[] = [];
    let firstError: unknown;
    for (const [index, entry] of unclaimed.entries()) {
      try {
        await this.claimWithRetry(entry);
      } catch (error) {
        failed.push(entry.anilistId);
        firstError ??= error;
        if (!isExpectedClaimFailure(error)) {
          notAttempted.push(
            ...unclaimed.slice(index + 1).map(({ anilistId }) => anilistId),
          );
          break;
        }
      }
    }
    if (failed.length > 0) {
      const skipped =
        notAttempted.length > 0
          ? `; not attempted: ${notAttempted.join(', ')}`
          : '';
      this.logger.warn(
        `Slug claim failed for ${failed.length} listed anime (${describeError(firstError)}): ${failed.join(', ')}${skipped}`,
      );
    }
  }

  /** Listed anime without an identity, each id once, in list order. */
  private async unclaimed(
    entries: readonly ListedAnime[],
  ): Promise<ListedAnime[]> {
    if (entries.length === 0) return [];
    const listed = new Map<number, ListedAnime>();
    for (const entry of entries) {
      if (!listed.has(entry.anilistId)) listed.set(entry.anilistId, entry);
    }
    const known = await this.prisma.animeIdentity.findMany({
      where: { anilistId: { in: [...listed.keys()] } },
      select: { anilistId: true },
    });
    const claimed = new Set(known.map(({ anilistId }) => anilistId));
    return [...listed.values()].filter(
      ({ anilistId }) => !claimed.has(anilistId),
    );
  }

  private async claimWithRetry(entry: ListedAnime, attempt = 1): Promise<void> {
    try {
      await this.prisma.$transaction((tx) => this.claim(tx, entry));
    } catch (error) {
      if (attempt < CLAIM_ATTEMPTS && isLostRace(error)) {
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
    const existing = await tx.animeIdentity.findUnique({
      where: { anilistId },
    });
    if (existing !== null) return;
    const source = slugSource(anilistId, entry);
    const candidates = canonicalCandidates(source);
    const taken = await tx.animeSlug.findMany({
      where: { slug: { in: candidates } },
    });
    const owners = new Map(taken.map((row) => [row.slug, row.anilistId]));
    const slug = pickCanonical(candidates, owners, anilistId);
    if (slug === undefined) {
      throw new NoFreeSlugError(anilistId);
    }
    const now = this.clock.now();
    await tx.animeIdentity.create({
      data: { anilistId, canonicalSlug: slug, createdAt: now },
    });
    await tx.animeSlug.create({ data: { slug, anilistId, createdAt: now } });
    const alias = romajiAlias(source);
    if (alias !== null) {
      await tx.animeSlug.createMany({
        data: [{ slug: alias, anilistId, createdAt: now }],
        skipDuplicates: true,
      });
    }
  }
}
