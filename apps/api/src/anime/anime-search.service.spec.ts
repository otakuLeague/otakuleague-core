import { describe, expect, it } from 'vitest';
import {
  type ApiCaller,
  type VisitorKey,
  OPEN_CALLER,
  PREVIEW_VISITOR_KEY,
  PREVIEW_CALLER,
  visitorKeyFromClientIp,
} from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import type { AnimeImportService } from './anime-import.service';
import { AnimeSearchService } from './anime-search.service';
import { SEARCH_VISITOR_BURST, SearchLimits } from './search-limits';

const failingDatabase = {
  $queryRaw: () => Promise.reject(new Error('no query expected')),
} as unknown as PrismaService;

const NOW = new Date('2026-10-15T12:00:00.000Z');
const UNKNOWN = visitorKeyFromClientIp(undefined);
const WEB: ApiCaller = { kind: 'web', visitorKey: UNKNOWN };

describe('AnimeSearchService', () => {
  const service = (enabled: boolean, limits?: SearchLimits) =>
    new AnimeSearchService(
      failingDatabase,
      new FixedClock(NOW),
      { isEnabled: () => enabled } as unknown as AnimeImportService,
      limits ?? new SearchLimits(new FixedClock(NOW)),
    );
  const request = { query: 'aot', page: 2, pageSize: 10 };

  it('answers an empty page without a query when every source is switched off', async () => {
    await expect(service(false).search(request, WEB)).resolves.toEqual({
      hits: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });
  });

  it.each(['!!!', '  -- ', '\u0301', '・'])(
    'answers an empty page without a query for %j, which has no letter or digit',
    async (query) => {
      await expect(
        service(true).search({ query, page: 1, pageSize: 24 }, WEB),
      ).resolves.toEqual({ hits: [], page: 1, pageSize: 24, total: 0 });
    },
  );

  const drain = (limits: SearchLimits, key: VisitorKey) => {
    for (let taken = 0; taken < SEARCH_VISITOR_BURST; taken += 1) {
      limits.takeVisitor(key);
    }
  };

  it('refuses a web caller with an empty bucket with a 429 before touching the database', async () => {
    const limits = new SearchLimits(new FixedClock(NOW));
    drain(limits, UNKNOWN);

    const refusal = await service(true, limits)
      .search(request, WEB)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiException);
    const exception = refusal as ApiException;
    expect(exception.getStatus()).toBe(429);
    expect(exception.error.code).toBe('ANIME_SEARCH_VISITOR_LIMIT_REACHED');
    expect(exception.retryAfterSeconds).toBe(2);
  });

  it('charges a preview caller on its own bucket, apart from the unknown one', async () => {
    const limits = new SearchLimits(new FixedClock(NOW));
    drain(limits, PREVIEW_VISITOR_KEY);

    const refusal = await service(false, limits)
      .search(request, PREVIEW_CALLER)
      .catch((error: unknown) => error);

    expect((refusal as ApiException).getStatus()).toBe(429);
    expect(limits.takeVisitor(UNKNOWN)).toEqual({ taken: true });
  });

  it('never charges or refuses an open caller', async () => {
    const limits = new SearchLimits(new FixedClock(NOW));
    const open = service(false, limits);
    for (let calls = 0; calls < SEARCH_VISITOR_BURST + 5; calls += 1) {
      await open.search(request, OPEN_CALLER);
    }
    expect(limits.takeVisitor(UNKNOWN)).toEqual({ taken: true });
  });
});
