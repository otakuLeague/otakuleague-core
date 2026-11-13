import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { findImportedAnilistIds } from './imported-anime';

/** Only the one delegate call `findImportedAnilistIds` makes, recording its argument. */
function fakePrisma(rows: readonly { externalId: number }[]): {
  prisma: PrismaService;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { animeExternalId: { findMany } } as unknown as PrismaService;
  return { prisma, findMany };
}

describe('findImportedAnilistIds', () => {
  it('returns no ids and runs no query for an empty input', async () => {
    const { prisma, findMany } = fakePrisma([]);

    const imported = await findImportedAnilistIds(prisma, []);

    expect([...imported]).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('queries ANILIST links by an IN list and returns the ids found', async () => {
    const { prisma, findMany } = fakePrisma([
      { externalId: 16498 },
      { externalId: 1 },
    ]);

    const imported = await findImportedAnilistIds(prisma, [16498, 1, 999]);

    expect(imported.has(16498)).toBe(true);
    expect(imported.has(1)).toBe(true);
    expect(imported.has(999)).toBe(false);
    expect(findMany).toHaveBeenCalledWith({
      where: { source: 'ANILIST', externalId: { in: [16498, 1, 999] } },
      select: { externalId: true },
    });
  });
});
