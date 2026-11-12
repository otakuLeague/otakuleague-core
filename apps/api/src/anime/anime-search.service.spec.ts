import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import type { AnimeImportService } from './anime-import.service';
import { AnimeSearchService } from './anime-search.service';

const failingDatabase = {
  $queryRaw: () => Promise.reject(new Error('no query expected')),
} as unknown as PrismaService;

describe('AnimeSearchService', () => {
  const service = (enabled: boolean) =>
    new AnimeSearchService(
      failingDatabase,
      new FixedClock(new Date('2026-10-15T12:00:00.000Z')),
      { isEnabled: () => enabled } as unknown as AnimeImportService,
    );

  it('answers an empty page without a query when every source is switched off', async () => {
    await expect(
      service(false).search({ query: 'aot', page: 2, pageSize: 10 }),
    ).resolves.toEqual({ hits: [], page: 2, pageSize: 10, total: 0 });
  });

  it.each(['!!!', '  -- ', '\u0301', '・'])(
    'answers an empty page without a query for %j, which has no letter or digit',
    async (query) => {
      await expect(
        service(true).search({ query, page: 1, pageSize: 24 }),
      ).resolves.toEqual({ hits: [], page: 1, pageSize: 24, total: 0 });
    },
  );
});
