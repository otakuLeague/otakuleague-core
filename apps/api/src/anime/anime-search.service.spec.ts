import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import type { AnimeImportService } from './anime-import.service';
import { AnimeSearchService } from './anime-search.service';

const failingDatabase = {
  $queryRaw: () => Promise.reject(new Error('no query expected')),
} as unknown as PrismaService;

describe('AnimeSearchService', () => {
  it('answers an empty page without a query when every source is switched off', async () => {
    const service = new AnimeSearchService(
      failingDatabase,
      new FixedClock(new Date('2026-10-15T12:00:00.000Z')),
      { isEnabled: () => false } as unknown as AnimeImportService,
    );

    await expect(
      service.search({ query: 'aot', page: 2, pageSize: 10 }),
    ).resolves.toEqual({ hits: [], page: 2, pageSize: 10, total: 0 });
  });
});
