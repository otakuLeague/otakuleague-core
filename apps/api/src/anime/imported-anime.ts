import type { PrismaService } from '../prisma/prisma.service';

/**
 * Which of these AniList ids we hold now (ADR 0018): an anime row linked to the id, the same
 * link `AnimeService.findStored` serves from, so a slug page for one costs no import. One
 * primary-key query; none for no ids.
 */
export async function findImportedAnilistIds(
  prisma: PrismaService,
  anilistIds: readonly number[],
): Promise<ReadonlySet<number>> {
  if (anilistIds.length === 0) return new Set();
  const links = await prisma.animeExternalId.findMany({
    where: { source: 'ANILIST', externalId: { in: [...anilistIds] } },
    select: { externalId: true },
  });
  return new Set(links.map(({ externalId }) => externalId));
}
