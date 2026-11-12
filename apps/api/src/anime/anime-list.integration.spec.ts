import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { AnimeDataSource, AnimeListPage } from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { encodeCursor } from './anime-list.query';
import { AnimeListService } from './anime-list.service';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import {
  AnimeSourceSettings,
  type SourceSettings,
} from './sources/source-settings';

const HOUR_MS = 3_600_000;

class MovableClock extends Clock {
  private instant = new Date('2026-11-12T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

class TestSourceSettings extends AnimeSourceSettings {
  anilistEnabled = true;

  constructor(private readonly url: () => string) {
    super();
  }

  get(source: AnimeDataSource): SourceSettings {
    return {
      enabled: source === 'anilist' ? this.anilistEnabled : false,
      baseUrl: this.url(),
      minIntervalMs: 0,
      timeoutMs: 2_000,
      maxRetryAfterMs: 1_000,
      coolDownMs: 0,
      maxQueueMs: 5_000,
    };
  }
}

/** A media object like AniList's, with only what the mapper needs. */
const media = (id: number) => ({
  id,
  isAdult: false,
  title: { romaji: `Synthetic ${id}`, english: null },
  coverImage: { large: null, color: null },
  format: 'TV',
  status: 'RELEASING',
  genres: [],
  popularity: 10,
  averageScore: 70,
});

/** A full source page: ids page*1000 + 0..49. */
const fullPage = (page: number) =>
  Array.from({ length: 50 }, (_, index) => media(page * 1000 + index));

describe('GET /anime/lists/:kind', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lists: AnimeListService;
  let clock: MovableClock;
  let settings: TestSourceSettings;
  let server: Server;
  /** The variables of each request the fake AniList received. */
  let requests: Record<string, unknown>[];
  /** What the fake AniList answers for a page: media and hasNextPage; HTTP 500 when failing. */
  let answer: (page: number) => { media: unknown[]; hasNextPage: boolean };
  let failing: boolean;

  const get = (path: string) => request(app.getHttpServer()).get(path);
  const list = async (path: string) =>
    (await get(path).expect(200)).body as AnimeListPage;
  const ids = (page: AnimeListPage) =>
    page.entries.map(({ anilistId }) => anilistId);
  const airingFixture = () => {
    const data = record(record(fixture('anilist-list-airing')).response).data;
    return record(record(data).Page).media as unknown[];
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const variables = record(record(JSON.parse(raw) as unknown).variables);
        requests.push(variables);
        if (failing) return void res.writeHead(500).end();
        const { media: found, hasNextPage } = answer(Number(variables.page));
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            data: { Page: { pageInfo: { hasNextPage }, media: found } },
          }),
        );
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
    lists = app.get(AnimeListService);
  });

  beforeEach(async () => {
    await lists.settle();
    await truncateAllTables(prisma);
    requests = [];
    failing = false;
    answer = (page) => ({ media: fullPage(page), hasNextPage: true });
    settings.anilistEnabled = true;
  });

  afterAll(async () => {
    await lists.settle();
    await app.close();
    server.close();
  });

  it('fetches a page we do not hold once, then answers from the database alone', async () => {
    answer = () => ({ media: airingFixture(), hasNextPage: false });

    const first = await list('/anime/lists/airing');
    const second = await list('/anime/lists/airing');

    // The fixture's adult entry is dropped by the mapper.
    expect(ids(first)).toEqual([900001, 900002, 900004]);
    expect(first).toMatchObject({
      kind: 'airing',
      freshness: 'fresh',
      nextCursor: null,
      fetchedAt: '2026-11-12T12:00:00.000Z',
    });
    expect(first.entries[0]).toMatchObject({
      slug: null,
      titleEnglish: 'Synthetic Magic Academy',
      score: { source: 'anilist', score: 81, scale: 100 },
    });
    expect(second).toEqual(first);
    expect(requests).toEqual([
      {
        page: 1,
        perPage: 50,
        sort: ['POPULARITY_DESC'],
        status: 'RELEASING',
      },
    ]);
  });

  it('shares one source call between simultaneous requests', async () => {
    const pages = await Promise.all(
      Array.from({ length: 5 }, () => list('/anime/lists/trending')),
    );

    expect(requests).toHaveLength(1);
    expect(new Set(pages.map((page) => page.fetchedAt)).size).toBe(1);
  });

  it('pages with a cursor, reading two stored pages across a boundary', async () => {
    const first = await list('/anime/lists/top?limit=48');
    const next = await list(
      `/anime/lists/top?limit=5&cursor=${first.nextCursor}`,
    );

    expect(first.entries).toHaveLength(48);
    expect(first.nextCursor).toBe(encodeCursor(48));
    expect(ids(next)).toEqual([1048, 1049, 2000, 2001, 2002]);
    expect(next.nextCursor).toBe(encodeCursor(53));
    expect(requests.map(({ page }) => page)).toEqual([1, 2]);
  });

  it('ends at the last page', async () => {
    answer = (page) => ({
      media: fullPage(page).slice(0, 3),
      hasNextPage: false,
    });

    const last = await list(`/anime/lists/upcoming?cursor=${encodeCursor(0)}`);

    expect(last.entries).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
  });

  /** Stored pages 1 to `count`, each with a next page, so the next one may be fetched. */
  const storePages = (count: number) =>
    prisma.animeListPage.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        listKey: 'top',
        page: index + 1,
        fetchedAt: clock.now(),
        hasNextPage: true,
        entries: [],
      })),
    });

  it('ends at the 1000-entry cap', async () => {
    await storePages(19);

    const capped = await list(
      `/anime/lists/top?limit=50&cursor=${encodeCursor(999)}`,
    );

    expect(ids(capped)).toEqual([20049]);
    expect(capped.nextCursor).toBeNull();
  });

  it('answers an empty page past the end of a list', async () => {
    await storePages(10);
    answer = () => ({ media: [], hasNextPage: false });

    expect(
      await list(`/anime/lists/top?cursor=${encodeCursor(500)}`),
    ).toMatchObject({ entries: [], nextCursor: null });
  });

  it('never asks AniList for a page whose predecessor we do not hold', async () => {
    const deep = await list(`/anime/lists/top?cursor=${encodeCursor(500)}`);
    await storePages(1);
    await prisma.animeListPage.update({
      where: { listKey_page: { listKey: 'top', page: 1 } },
      data: { hasNextPage: false },
    });
    const pastEnd = await list(`/anime/lists/top?cursor=${encodeCursor(50)}`);

    expect(deep).toMatchObject({ entries: [], nextCursor: null });
    expect(pastEnd).toMatchObject({ entries: [], nextCursor: null });
    expect(requests).toHaveLength(0);
  });

  it('serves a stale page at once and refreshes it in the background', async () => {
    await list('/anime/lists/trending');
    clock.advance(HOUR_MS);
    answer = () => ({ media: [media(7)], hasNextPage: false });

    const stale = await list('/anime/lists/trending');
    await lists.settle();
    const refreshed = await list('/anime/lists/trending');

    expect(stale.freshness).toBe('stale');
    expect(stale.entries).toHaveLength(24);
    expect(refreshed).toMatchObject({ freshness: 'fresh', nextCursor: null });
    expect(ids(refreshed)).toEqual([7]);
    expect(requests).toHaveLength(2);
  });

  it('keeps a page fresh for its own lifetime: 1 hour for trending, 6 for airing', async () => {
    await list('/anime/lists/trending');
    await list('/anime/lists/airing');
    clock.advance(HOUR_MS - 1);

    expect((await list('/anime/lists/trending')).freshness).toBe('fresh');
    clock.advance(1);
    expect((await list('/anime/lists/trending')).freshness).toBe('stale');
    expect((await list('/anime/lists/airing')).freshness).toBe('fresh');
  });

  it('serves the stale page with 200 while AniList is down', async () => {
    await list('/anime/lists/airing');
    clock.advance(24 * HOUR_MS);
    failing = true;

    const stale = await list('/anime/lists/airing');
    await lists.settle();
    const again = await list('/anime/lists/airing');

    expect(stale.freshness).toBe('stale');
    expect(again.freshness).toBe('stale');
    expect(again.entries).toHaveLength(24);
  });

  it('answers 503 for a page we do not hold while AniList is down', async () => {
    failing = true;

    const response = await get('/anime/lists/airing').expect(503);

    expect(response.body).toEqual({
      error: {
        code: 'ANIME_SOURCES_UNAVAILABLE',
        message: 'The anime data sources are unavailable. Try again later.',
      },
    });
  });

  it('does not ask again for 5 minutes after a failed fetch', async () => {
    failing = true;
    await get('/anime/lists/airing').expect(503);
    failing = false;

    await get('/anime/lists/airing').expect(503);
    clock.advance(5 * 60 * 1000);
    const recovered = await list('/anime/lists/airing');

    expect(requests).toHaveLength(2);
    expect(recovered.entries).toHaveLength(24);
  });

  it('never replaces a stored first page with an empty answer', async () => {
    await list('/anime/lists/trending');
    clock.advance(HOUR_MS);
    answer = () => ({ media: [], hasNextPage: false });

    await list('/anime/lists/trending');
    await lists.settle();
    const after = await list('/anime/lists/trending');

    expect(requests).toHaveLength(2);
    expect(after).toMatchObject({ freshness: 'stale' });
    expect(after.entries).toHaveLength(24);
  });

  it('treats a degraded answer as a failure: errors next to a Page, nothing usable in it', async () => {
    answer = () => ({
      media: [{ id: 5, isAdult: true, title: {} }],
      hasNextPage: false,
    });

    await get('/anime/lists/top').expect(503);
    expect(await prisma.animeListPage.count()).toBe(0);
  });

  it('purges pages not refreshed for 30 days, and only those', async () => {
    const day = 24 * HOUR_MS;
    await prisma.animeListPage.createMany({
      data: [
        { page: 1, age: 31 },
        { page: 2, age: 30 },
        { page: 3, age: 29 },
      ].map(({ page, age }) => ({
        listKey: 'top',
        page,
        fetchedAt: new Date(clock.now().getTime() - age * day),
        hasNextPage: true,
        entries: [],
      })),
    });

    expect(await lists.purgeStale()).toBe(1);
    expect(
      (await prisma.animeListPage.findMany({ orderBy: { page: 'asc' } })).map(
        ({ page }) => page,
      ),
    ).toEqual([2, 3]);
  });

  it('treats a stored page that no longer validates as missing', async () => {
    await prisma.animeListPage.create({
      data: {
        listKey: 'airing',
        page: 1,
        fetchedAt: clock.now(),
        hasNextPage: true,
        entries: [{ anilistId: 'not a number' }],
      },
    });

    expect(await list('/anime/lists/airing')).toMatchObject({
      freshness: 'fresh',
    });
    expect(requests).toHaveLength(1);
  });

  it('joins slugs from known identities and drops removed anime', async () => {
    answer = () => ({
      media: [media(1), media(2), media(3)],
      hasNextPage: false,
    });
    await prisma.animeIdentity.createMany({
      data: [
        { anilistId: 1, canonicalSlug: 'one', createdAt: clock.now() },
        {
          anilistId: 2,
          canonicalSlug: 'two',
          removedAt: clock.now(),
          createdAt: clock.now(),
        },
      ],
    });

    const page = await list('/anime/lists/top');

    expect(
      page.entries.map(({ anilistId, slug }) => [anilistId, slug]),
    ).toEqual([
      [1, 'one'],
      [3, null],
    ]);
  });

  it('answers 503 without reading the cache while AniList is switched off, and recovers', async () => {
    await list('/anime/lists/airing');
    settings.anilistEnabled = false;

    const response = await get('/anime/lists/airing').expect(503);
    settings.anilistEnabled = true;

    expect(response.body).toMatchObject({
      error: { code: 'ANIME_SOURCES_UNAVAILABLE' },
    });
    expect((await list('/anime/lists/airing')).freshness).toBe('fresh');
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['unknown list', '/anime/lists/seasonal'],
    ['malformed cursor', '/anime/lists/top?cursor=!!!'],
    ['cursor past the cap', `/anime/lists/top?cursor=${encodeCursor(1_000)}`],
    ['limit 0', '/anime/lists/top?limit=0'],
    ['limit above the maximum', '/anime/lists/top?limit=51'],
    ['fractional limit', '/anime/lists/top?limit=1.5'],
    ['unknown parameter', '/anime/lists/top?genre=Fantasy'],
  ])('rejects %s with 400 and calls nobody', async (_name, path) => {
    const response = await get(path).expect(400);

    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(requests).toHaveLength(0);
  });
});
