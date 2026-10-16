import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { DAY_MS, PURGE_AFTER_MS } from './cache-ttl';
import { FranchiseWalker } from './franchise-walker.service';
import { AniListAdapter } from './sources/anilist.adapter';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import {
  AnimeSourceSettings,
  type SourceSettings,
} from './sources/source-settings';

const WALKS = [
  'attack-on-titan',
  'demon-slayer',
  'fate-zero',
  'frieren',
  'fullmetal-alchemist-2003',
  'fullmetal-alchemist-brotherhood',
  'gintama',
  'monogatari',
  'one-piece',
];

/** Every recorded media object of every walk, by AniList id. */
const RECORDED = new Map(
  WALKS.flatMap((name) =>
    (fixture(`anilist-walk-${name}`) as unknown[]).flatMap((level) =>
      (
        record(record(record(record(level).response).data).Page)
          .media as unknown[]
      ).map((media) => [record(media).id, media] as const),
    ),
  ),
);

class MovableClock extends Clock {
  private instant = new Date('2026-10-16T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

class TestSourceSettings extends AnimeSourceSettings {
  anilistEnabled = true;
  minIntervalMs = 0;
  coolDownMs = 0;

  constructor(private readonly url: () => string) {
    super();
  }

  get(source: AnimeDataSource): SourceSettings {
    return {
      enabled: source === 'anilist' ? this.anilistEnabled : false,
      baseUrl: this.url(),
      minIntervalMs: this.minIntervalMs,
      timeoutMs: 2_000,
      maxRetryAfterMs: 1_000,
      coolDownMs: this.coolDownMs,
      maxQueueMs: 5_000,
    };
  }
}

describe('FranchiseWalker', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let walker: FranchiseWalker;
  let clock: MovableClock;
  let settings: TestSourceSettings;
  let server: Server;
  /** The ids of each request the fake AniList received. */
  let requests: number[][];
  /** Ids the fake AniList leaves out of its answers, and whether it answers HTTP 500. */
  let unanswered: Set<number>;
  let failing: boolean;
  /** Answers wait for it: a test holds a walk in flight. */
  let gate: Promise<void>;

  const storedIds = async () =>
    (
      await prisma.animeRelationNode.findMany({
        select: { anilistId: true },
        orderBy: { anilistId: 'asc' },
      })
    ).map(({ anilistId }) => anilistId);
  const boundary = (anilistIds: number[]) =>
    prisma.animeFranchiseOverride.createMany({
      data: anilistIds.map((anilistId) => ({
        anilistId,
        role: 'BOUNDARY' as const,
        note: 'test',
        createdAt: clock.now(),
      })),
    });

  /** A walker with its own adapter, built from the current settings. */
  const standaloneWalker = () =>
    new FranchiseWalker(prisma, clock, settings, new AniListAdapter(settings));
  /** Holds every answer until the returned function is called. */
  const holdAnswers = () => {
    let release = () => {};
    gate = new Promise((resolve) => (release = resolve));
    return () => release();
  };
  const untilRequests = (count: number) =>
    vi.waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(count));

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const ids = record(record(JSON.parse(raw) as unknown).variables)
          .ids as number[];
        requests.push(ids);
        void gate.then(() => {
          if (failing) return void res.writeHead(500).end();
          const media = ids.flatMap((id) =>
            unanswered.has(id) ? [] : (RECORDED.get(id) ?? []),
          );
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({
              data: { Page: { pageInfo: { hasNextPage: false }, media } },
            }),
          );
        });
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    settings = new TestSourceSettings(
      () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    );
    clock = new MovableClock();
    app = await createTestApp({
      clock,
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    prisma = app.get(PrismaService);
    walker = app.get(FranchiseWalker);
  });

  beforeEach(async () => {
    await walker.settle();
    await truncateAllTables(prisma);
    requests = [];
    unanswered = new Set();
    failing = false;
    gate = Promise.resolve();
    settings.anilistEnabled = true;
    settings.minIntervalMs = 0;
    settings.coolDownMs = 0;
  });

  afterAll(async () => {
    await walker.settle();
    await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('walks Attack on Titan level by level through its OVA prequel, then reuses fresh rows', async () => {
    expect(await walker.walk(16498)).toBe('complete');

    expect(await storedIds()).toEqual([
      16498, 20811, 20958, 99147, 104578, 110277, 131681, 146984, 162314,
    ]);
    expect(requests).toEqual([
      [16498],
      [20811, 20958],
      [99147],
      [104578],
      [110277],
      [131681],
      [146984],
      [162314],
    ]);

    requests = [];
    await walker.walk(16498);
    expect(requests).toEqual([]);
  });

  it('stores the same franchise whichever entry the walk starts from', async () => {
    await walker.walk(99147);

    expect(await storedIds()).toHaveLength(9);
    expect(await storedIds()).toContain(16498);
  });

  it('fetches stale rows again, keeping when they were last used', async () => {
    await walker.walk(5114);
    const firstUse = clock.now();
    clock.advance(8 * DAY_MS);

    await walker.walk(5114);

    const row = await prisma.animeRelationNode.findUniqueOrThrow({
      where: { anilistId: 5114 },
    });
    expect(requests).toEqual([[5114], [5114]]);
    expect(row.fetchedAt).toEqual(clock.now());
    expect(row.lastUsedAt).toEqual(firstUse);
  });

  it('refetches an unaired entry after one day and keeps finished ones', async () => {
    await walker.walk(154587);
    clock.advance(DAY_MS);
    requests = [];

    await walker.walk(154587);

    expect(requests).toEqual([[209939]]);
  });

  it('neither stores nor walks through an id AniList left out, and tries it next walk', async () => {
    unanswered = new Set([99147]);
    await walker.walk(16498);
    expect(await storedIds()).toEqual([16498, 20811, 20958]);

    unanswered = new Set();
    requests = [];
    await walker.walk(16498);
    expect(requests[0]).toEqual([99147]);
    expect(await storedIds()).toHaveLength(9);
  });

  it('keeps Fullmetal Alchemist 2003 and Brotherhood apart', async () => {
    await walker.walk(121);
    await walker.walk(5114);

    expect(await storedIds()).toEqual([121, 430, 5114]);
  });

  it('reports a cut level as truncated, even when nothing follows it', async () => {
    // Without boundaries Fate/Zero Season 2 has four sequels; a cap of 3 keeps one of them.
    expect(await walker.walk(10087, 3)).toBe('truncated');
    expect(await storedIds()).toEqual([356, 10087, 11741]);
  });

  it('stops at the node cap', async () => {
    expect(await walker.walk(918, 5)).toBe('truncated');

    expect(await storedIds()).toHaveLength(5);
    expect(requests.flat()).toHaveLength(5);
  });

  it('starts a franchise at each BOUNDARY entry, whichever entry the walk starts from', async () => {
    await boundary([356, 19603, 6922, 20791]);

    await walker.walk(10087);
    expect(await storedIds()).toEqual([10087, 11741]);
    expect(requests).toEqual([[10087], [11741]]);

    await truncateAllTables(prisma);
    await boundary([356, 19603, 6922, 20791]);
    await walker.walk(20792);
    expect(await storedIds()).toEqual([19603, 20792]);

    await walker.walk(21719);
    expect(await storedIds()).toEqual([19603, 20791, 20792, 21718, 21719]);
  });

  it('sends nothing while AniList is switched off', async () => {
    settings.anilistEnabled = false;

    expect(await walker.walk(16498)).toBe('stopped');

    expect(requests).toEqual([]);
    expect(await storedIds()).toEqual([]);
  });

  it('waits for a free slot between levels instead of failing', async () => {
    // Long enough that the next level always finds the slot taken.
    settings.minIntervalMs = 150;

    await standaloneWalker().walk(154587);

    expect(await storedIds()).toEqual([154587, 182255, 209939]);
    expect(requests).toHaveLength(3);
  });

  it('runs queued walks one at a time, once per start', async () => {
    walker.request(16498);
    walker.request(16498);
    walker.request(121);
    await walker.settle();

    expect(await storedIds()).toHaveLength(11);
    expect(requests).toHaveLength(10);
  });

  it('ignores a request for the walk in flight', async () => {
    const walks = vi.spyOn(walker, 'walk');
    const release = holdAnswers();
    walker.request(5114);
    await untilRequests(1);

    walker.request(5114);
    release();
    await walker.settle();

    expect(walks).toHaveBeenCalledTimes(1);
    walks.mockRestore();
  });

  it('stops between levels on shutdown and takes no new walk', async () => {
    const stoppable = standaloneWalker();
    const release = holdAnswers();
    stoppable.request(16498);
    await untilRequests(1);

    const destroyed = stoppable.onModuleDestroy();
    release();
    await destroyed;
    stoppable.request(121);
    await stoppable.settle();

    expect(requests).toEqual([[16498]]);
    expect(await storedIds()).toEqual([16498]);
  });

  it('stops without a request while AniList cools down after a failure', async () => {
    settings.coolDownMs = 60_000;
    const cooling = standaloneWalker();
    failing = true;
    await expect(cooling.walk(16498)).rejects.toThrow('anilist unavailable');

    failing = false;
    expect(await cooling.walk(16498)).toBe('stopped');
    expect(requests).toHaveLength(1);
  });

  it('ends a queued walk on an AniList error and still runs the next one', async () => {
    failing = true;
    walker.request(5114);
    await walker.settle();
    expect(await storedIds()).toEqual([]);

    failing = false;
    walker.request(5114);
    await walker.settle();
    expect(await storedIds()).toEqual([5114]);
  });

  it('purges rows no franchise view used for 30 days', async () => {
    await walker.walk(121);
    clock.advance(PURGE_AFTER_MS + 1);
    await walker.walk(5114);

    expect(await walker.purgeUnused()).toBe(2);
    expect(await storedIds()).toEqual([5114]);
  });
});
