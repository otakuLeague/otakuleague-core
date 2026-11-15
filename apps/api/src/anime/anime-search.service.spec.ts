import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
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
import { Clock } from '../common/clock-and-random.module';
import { FixedClock } from '../testing/test-app';
import { SEARCH_MAX_IN_FLIGHT, SearchInFlight } from './search-in-flight';
import type { AnimeImportService } from './anime-import.service';
import { AnimeSearchService } from './anime-search.service';
import { SEARCH_VISITOR_BURST, SearchLimits } from './search-limits';

const failingDatabase = {
  $queryRaw: () => Promise.reject(new Error('no query expected')),
} as unknown as PrismaService;

const NOW = new Date('2026-10-15T12:00:00.000Z');
const UNKNOWN = visitorKeyFromClientIp(undefined);
const WEB: ApiCaller = { kind: 'web', visitorKey: UNKNOWN };

class MovableClock extends Clock {
  constructor(private instant: Date) {
    super();
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date): void {
    this.instant = instant;
  }
}

describe('AnimeSearchService', () => {
  const service = (enabled: boolean, limits?: SearchLimits) =>
    new AnimeSearchService(
      failingDatabase,
      new FixedClock(NOW),
      { isEnabled: () => enabled } as unknown as AnimeImportService,
      limits ?? new SearchLimits(new FixedClock(NOW)),
      new SearchInFlight(),
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

  describe('cap on searches in flight (OTA-199)', () => {
    /** A database whose ranking transactions stay open until released; it counts every call. */
    const slowDatabase = () => {
      const releases: Array<() => void> = [];
      const prisma = {
        calls: 0,
        $transaction: () => {
          prisma.calls += 1;
          return new Promise((resolve) => {
            releases.push(() => resolve({ matches: [], total: 0 }));
          });
        },
        anime: {
          findMany: () => Promise.reject(new Error('no read expected')),
        },
      };
      return { prisma, releases };
    };
    const busyService = (
      prisma: unknown,
      options: { limits?: SearchLimits; enabled?: boolean; clock?: Clock } = {},
    ) => {
      const clock = options.clock ?? new FixedClock(NOW);
      return new AnimeSearchService(
        prisma as PrismaService,
        clock,
        {
          isEnabled: () => options.enabled ?? true,
        } as unknown as AnimeImportService,
        options.limits ?? new SearchLimits(clock),
        new SearchInFlight(),
      );
    };
    const fillSlots = (
      target: AnimeSearchService,
      caller: ApiCaller = OPEN_CALLER,
    ) =>
      Array.from({ length: SEARCH_MAX_IN_FLIGHT }, () =>
        target.search(request, caller),
      );
    const refusalOf = async (promise: Promise<unknown>) =>
      (await promise.catch((error: unknown) => error)) as ApiException;

    it('refuses the search past the cap with 429 ANIME_SEARCH_BUSY and no database call', async () => {
      const { prisma, releases } = slowDatabase();
      const target = busyService(prisma);
      const running = fillSlots(target, WEB);

      const refusal = await refusalOf(target.search(request, WEB));

      expect(refusal).toBeInstanceOf(ApiException);
      expect(refusal.getStatus()).toBe(429);
      expect(refusal.error.code).toBe('ANIME_SEARCH_BUSY');
      expect(refusal.retryAfterSeconds).toBe(1);
      expect(prisma.calls).toBe(SEARCH_MAX_IN_FLIGHT);
      for (const release of releases) release();
      await Promise.all(running);
    });

    it('refuses an open caller too', async () => {
      const { prisma, releases } = slowDatabase();
      const target = busyService(prisma);
      const running = fillSlots(target);

      const refusal = await refusalOf(target.search(request, OPEN_CALLER));

      expect(refusal.error.code).toBe('ANIME_SEARCH_BUSY');
      for (const release of releases) release();
      await Promise.all(running);
    });

    it('frees the slot when a search fails', async () => {
      let calls = 0;
      const prisma = {
        $transaction: () => {
          calls += 1;
          return Promise.reject(new Error('database down'));
        },
      };
      const target = busyService(prisma);

      for (let attempt = 0; attempt < SEARCH_MAX_IN_FLIGHT + 1; attempt += 1) {
        await expect(target.search(request, OPEN_CALLER)).rejects.toThrow(
          'database down',
        );
      }
      expect(calls).toBe(SEARCH_MAX_IN_FLIGHT + 1);
    });

    it('still answers an empty page for unsearchable text or switched-off sources while full', async () => {
      const { prisma, releases } = slowDatabase();
      const target = busyService(prisma);
      const running = fillSlots(target);

      await expect(
        target.search({ ...request, query: '!!!' }, OPEN_CALLER),
      ).resolves.toMatchObject({ hits: [], total: 0 });
      await expect(
        busyService(prisma, { enabled: false }).search(request, OPEN_CALLER),
      ).resolves.toMatchObject({ hits: [], total: 0 });
      for (const release of releases) release();
      await Promise.all(running);
    });

    it('answers the visitor limit, not busy, when the visitor bucket is empty', async () => {
      const { prisma, releases } = slowDatabase();
      const limits = new SearchLimits(new FixedClock(NOW));
      const target = busyService(prisma, { limits });
      const running = fillSlots(target, OPEN_CALLER);
      drain(limits, UNKNOWN);

      const refusal = await refusalOf(target.search(request, WEB));

      expect(refusal.error.code).toBe('ANIME_SEARCH_VISITOR_LIMIT_REACHED');
      for (const release of releases) release();
      await Promise.all(running);
    });

    it('spends the visitor token on a busy refusal', async () => {
      const { prisma, releases } = slowDatabase();
      const limits = new SearchLimits(new FixedClock(NOW));
      const target = busyService(prisma, { limits });
      const running = fillSlots(target, OPEN_CALLER);

      await refusalOf(target.search(request, WEB));

      let remaining = 0;
      while (limits.takeVisitor(UNKNOWN).taken) remaining += 1;
      expect(remaining).toBe(SEARCH_VISITOR_BURST - 1);
      for (const release of releases) release();
      await Promise.all(running);
    });

    it('warns once a minute', async () => {
      const { prisma, releases } = slowDatabase();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation();
      const clock = new MovableClock(NOW);
      const target = busyService(prisma, { clock });
      const running = fillSlots(target);

      await refusalOf(target.search(request, OPEN_CALLER));
      await refusalOf(target.search(request, OPEN_CALLER));
      expect(warn).toHaveBeenCalledTimes(1);

      clock.set(new Date(NOW.getTime() + 60_000));
      await refusalOf(target.search(request, OPEN_CALLER));
      expect(warn).toHaveBeenCalledTimes(2);

      warn.mockRestore();
      for (const release of releases) release();
      await Promise.all(running);
    });
  });
});
