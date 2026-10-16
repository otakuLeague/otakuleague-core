import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  AnimeDataSource,
  AnimeFranchise,
} from '@otakuleague/shared-types';
import request from 'supertest';
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
import { FranchiseWalker, relationsKey } from './franchise-walker.service';
import {
  BACKOFF_MAX_MS,
  BACKOFF_STEPS_MS,
  SourceBackoff,
} from './source-backoff';
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
    new FranchiseWalker(
      prisma,
      clock,
      settings,
      new AniListAdapter(settings),
      new SourceBackoff(clock),
    );
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
    // The app's backoff outlives a test, step memory included: start each test clean.
    for (const id of [121, 5114, 209939]) {
      app.get(SourceBackoff).clear(relationsKey(id));
    }
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

  it('neither stores nor walks through an id AniList left out, and asks again only after its backoff', async () => {
    const leaving = standaloneWalker();
    unanswered = new Set([99147]);
    expect(await leaving.walk(16498)).toBe('missing');
    expect(await storedIds()).toEqual([16498, 20811, 20958]);

    unanswered = new Set();
    requests = [];
    expect(await leaving.walk(16498)).toBe('missing');
    expect(requests).toEqual([]);

    clock.advance(BACKOFF_MAX_MS + 1);
    expect(await leaving.walk(16498)).toBe('complete');
    expect(requests.flat()).toContain(99147);
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

  it('rejects an override label of only spaces or over 60 characters', async () => {
    const override = (label: string) =>
      prisma.animeFranchiseOverride.create({
        data: { anilistId: 1, label, note: 'test', createdAt: clock.now() },
      });

    const violation = /anime_franchise_override_label_check/;

    await expect(override('   ')).rejects.toThrow(violation);
    await expect(override('x'.repeat(61))).rejects.toThrow(violation);
    await expect(override('x'.repeat(60))).resolves.toMatchObject({
      anilistId: 1,
    });
  });

  it('purges rows no franchise view used for 30 days', async () => {
    await walker.walk(121);
    clock.advance(PURGE_AFTER_MS + 1);
    await walker.walk(5114);

    expect(await walker.purgeUnused()).toBe(2);
    expect(await storedIds()).toEqual([5114]);
  });

  describe('GET /anime/slugs/:slug/franchise', () => {
    const franchise = async (slug: string) =>
      (await request(app.getHttpServer()).get(`/anime/slugs/${slug}/franchise`))
        .body as AnimeFranchise;
    const identity = async (
      anilistId: number,
      slug: string,
      removedAt: Date | null = null,
    ) => {
      await prisma.animeIdentity.create({
        data: {
          anilistId,
          canonicalSlug: slug,
          createdAt: clock.now(),
          removedAt,
        },
      });
      await prisma.animeSlug.create({
        data: { slug, anilistId, createdAt: clock.now() },
      });
    };

    it('answers walking first, then the franchise with labels, slugs and the current entry', async () => {
      await identity(16498, 'attack-on-titan');
      await identity(20958, 'attack-on-titan-season-2');

      expect(await franchise('attack-on-titan')).toEqual({
        state: 'walking',
        mainLine: [],
        related: [],
      });
      await walker.settle();
      const aot = await franchise('attack-on-titan');

      expect(aot.state).toBe('complete');
      expect(aot.mainLine.map(({ label }) => label)).toEqual([
        'Season 1',
        'Season 2',
        'Season 3',
        'Season 3 Part 2',
        'Final Season',
        'Final Season Part 2',
      ]);
      expect(aot.mainLine.slice(0, 3)).toMatchObject([
        { slug: 'attack-on-titan', isCurrent: true },
        { slug: 'attack-on-titan-season-2', isCurrent: false },
        { slug: null, isCurrent: false },
      ]);
      expect(
        aot.related.find(({ group }) => group === 'source')?.entries[0],
      ).toMatchObject({ mediaType: 'MANGA', slug: null });
    });

    it('queues no walk while the rows are fresh, one when they are stale', async () => {
      await identity(5114, 'fullmetal-alchemist-brotherhood');
      await franchise('fullmetal-alchemist-brotherhood');
      await walker.settle();
      requests = [];

      await franchise('fullmetal-alchemist-brotherhood');
      await walker.settle();
      expect(requests).toEqual([]);

      clock.advance(8 * DAY_MS);
      await franchise('fullmetal-alchemist-brotherhood');
      await walker.settle();
      expect(requests).toEqual([[5114]]);
    });

    it('answers for any slug of the anime, without a redirect', async () => {
      await identity(121, 'fullmetal-alchemist');
      await prisma.animeSlug.create({
        data: {
          slug: 'hagane-no-renkinjutsushi',
          anilistId: 121,
          createdAt: clock.now(),
        },
      });
      await franchise('fullmetal-alchemist');
      await walker.settle();

      expect(
        (await franchise('Hagane-No-Renkinjutsushi')).mainLine,
      ).toMatchObject([
        { anilistId: 121, label: 'Season 1', slug: 'fullmetal-alchemist' },
      ]);
    });

    it('bumps last_used_at on the rows it shows, at most hourly', async () => {
      await identity(121, 'fullmetal-alchemist');
      await franchise('fullmetal-alchemist');
      await walker.settle();
      clock.advance(2 * 60 * 60 * 1000);

      await franchise('fullmetal-alchemist');

      const rows = await prisma.animeRelationNode.findMany();
      expect(rows.map(({ lastUsedAt }) => lastUsedAt)).toEqual([
        clock.now(),
        clock.now(),
      ]);
    });

    it('is unavailable, with nothing sent, while AniList is switched off', async () => {
      await identity(16498, 'attack-on-titan');
      settings.anilistEnabled = false;

      expect(await franchise('attack-on-titan')).toEqual({
        state: 'unavailable',
        mainLine: [],
        related: [],
      });
      await walker.settle();
      expect(requests).toEqual([]);
    });

    it('answers 404 for an unknown slug or a removed anime', async () => {
      await identity(16498, 'attack-on-titan', clock.now());
      const get = (slug: string) =>
        request(app.getHttpServer()).get(`/anime/slugs/${slug}/franchise`);

      await get('attack-on-titan').expect(404);
      await get('no-such-anime').expect(404);
    });

    it('honours BOUNDARY overrides and hides a removed identity among Related targets', async () => {
      await identity(10087, 'fate-zero');
      await identity(356, 'fate-stay-night', clock.now());
      await boundary([356, 19603, 6922, 20791]);
      await franchise('fate-zero');
      await walker.settle();

      const fateZero = await franchise('fate-zero');
      const relatedIds = fateZero.related.flatMap(({ entries }) =>
        entries.map(({ anilistId }) => anilistId),
      );
      expect(fateZero.state).toBe('complete');
      expect(fateZero.mainLine.map(({ anilistId }) => anilistId)).toEqual([
        10087, 11741,
      ]);
      expect(relatedIds).toContain(19603);
      expect(relatedIds).not.toContain(356);
    });

    it('shows a season again an hour after one truncated answer, partial meanwhile', async () => {
      await identity(154587, 'frieren-beyond-journeys-end');
      unanswered = new Set([209939]);
      await franchise('frieren-beyond-journeys-end');
      await walker.settle();

      const meanwhile = await franchise('frieren-beyond-journeys-end');
      expect(meanwhile.state).toBe('partial');
      expect(meanwhile.mainLine.map(({ label }) => label)).toEqual([
        'Season 1',
        'Season 2',
      ]);

      unanswered = new Set();
      clock.advance(60 * 60 * 1000);
      expect((await franchise('frieren-beyond-journeys-end')).state).toBe(
        'walking',
      );
      await walker.settle();
      const after = await franchise('frieren-beyond-journeys-end');

      expect(after.state).toBe('complete');
      expect(after.mainLine.map(({ label }) => label)).toEqual([
        'Season 1',
        'Season 2',
        'Season 3',
      ]);
      // The answer reset the ladder: a new omission waits one hour again, not six.
      const backoff = app.get(SourceBackoff);
      backoff.backOff(relationsKey(209939));
      clock.advance(60 * 60 * 1000);
      expect(backoff.stage(relationsKey(209939))).toBe('clear');
    });

    it('stops walking for a backed-off start or a backed-off stale row', async () => {
      await identity(121, 'fullmetal-alchemist');
      unanswered = new Set([121]);
      await franchise('fullmetal-alchemist');
      await walker.settle();
      // A queued walk would send nothing either (the walker skips backed-off ids): watch the queue.
      const queued = vi.spyOn(walker, 'request');

      expect(await franchise('fullmetal-alchemist')).toEqual({
        state: 'partial',
        mainLine: [],
        related: [],
      });
      expect(queued).not.toHaveBeenCalled();

      await identity(5114, 'fullmetal-alchemist-brotherhood');
      unanswered = new Set();
      await franchise('fullmetal-alchemist-brotherhood');
      await walker.settle();
      clock.advance(8 * DAY_MS);
      unanswered = new Set([5114]);
      await franchise('fullmetal-alchemist-brotherhood');
      await walker.settle();
      queued.mockClear();

      await franchise('fullmetal-alchemist-brotherhood');
      expect(queued).not.toHaveBeenCalled();

      queued.mockRestore();
    });

    it('is complete without an id AniList keeps leaving out, once its backoff reaches a week', async () => {
      await identity(154587, 'frieren-beyond-journeys-end');
      unanswered = new Set([209939]);
      await franchise('frieren-beyond-journeys-end');
      await walker.settle();
      // Left out again at each retry: 1 h, 6 h, 1 d, then the week-long step.
      for (const wait of BACKOFF_STEPS_MS.slice(0, -1)) {
        expect((await franchise('frieren-beyond-journeys-end')).state).toBe(
          'partial',
        );
        clock.advance(wait);
        await franchise('frieren-beyond-journeys-end');
        await walker.settle();
      }

      const frieren = await franchise('frieren-beyond-journeys-end');
      expect(frieren.state).toBe('complete');
      expect(frieren.mainLine.map(({ label }) => label)).toEqual([
        'Season 1',
        'Season 2',
      ]);
      requests = [];
      await franchise('frieren-beyond-journeys-end');
      await walker.settle();
      expect(requests).toEqual([]);
    });
  });
});
