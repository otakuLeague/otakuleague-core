import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type INestApplication, Logger } from '@nestjs/common';
import type { AnimeDataSource, AnimeListPage } from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  afterEach,
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
import { encodeCursor } from './anime-list.query';
import { LIST_FETCH_BURST, LIST_FETCH_REFILL_MS } from './list-fetch-limits';
import { AnimeListService } from './anime-list.service';
import { AniListAdapter } from './sources/anilist.adapter';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import {
  AnimeSourceSettings,
  type SourceSettings,
} from './sources/source-settings';
import { SourceUnavailableError } from './sources/source.types';

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
const media = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  isAdult: false,
  title: { romaji: `Synthetic ${id}`, english: null },
  coverImage: { large: null, color: null },
  format: 'TV',
  status: 'RELEASING',
  genres: [],
  popularity: 10,
  averageScore: 70,
  ...extra,
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
    const data = record(record(fixture('lists/anilist-airing')).response).data;
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
  });

  // A new app and clock per test: the service keeps per-block retry delays in memory, so a
  // block that failed in one test would answer 503 in the next one at the same instant.
  beforeEach(async () => {
    requests = [];
    failing = false;
    answer = (page) => ({ media: fullPage(page), hasNextPage: true });
    settings.anilistEnabled = true;
    clock = new MovableClock();
    app = await createTestApp({
      clock,
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    prisma = app.get(PrismaService);
    lists = app.get(AnimeListService);
    await truncateAllTables(prisma);
  });

  afterEach(async () => {
    await lists.settle();
    await app.close();
  });

  afterAll(() => {
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
      slug: 'synthetic-magic-academy',
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

  describe('seasonal and genre', () => {
    const seasonalFixture = () => {
      const data = record(
        record(fixture('lists/anilist-seasonal-fall-2026')).response,
      ).data;
      return record(record(data).Page).media as unknown[];
    };

    it('defaults to the current season, echoes it, and shares its row with the explicit request', async () => {
      answer = () => ({ media: seasonalFixture(), hasNextPage: false });

      const bare = await list('/anime/lists/seasonal');
      const explicit = await list(
        '/anime/lists/seasonal?season=FALL&year=2026',
      );

      expect(bare).toMatchObject({
        kind: 'seasonal',
        season: { season: 'FALL', year: 2026 },
        nextCursor: null,
      });
      expect(ids(bare)).toEqual([900101, 900102, 900103]);
      expect(bare.entries[2]).toMatchObject({ score: null, episodes: null });
      expect(explicit).toEqual(bare);
      expect(requests).toEqual([
        {
          page: 1,
          perPage: 50,
          sort: ['POPULARITY_DESC'],
          season: 'FALL',
          seasonYear: 2026,
        },
      ]);
      expect(
        (await prisma.animeListPage.findMany()).map(({ listKey }) => listKey),
      ).toEqual(['seasonal|season=FALL|year=2026']);
    });

    it('stores a genre filter apart from the unfiltered list and sends it to AniList', async () => {
      await list('/anime/lists/top');
      const filtered = await list('/anime/lists/top?genre=Slice%20of%20Life');

      expect(filtered.season).toBeNull();
      expect(requests.map(({ genre }) => genre)).toEqual([
        undefined,
        'Slice of Life',
      ]);
      expect(
        (
          await prisma.animeListPage.findMany({ orderBy: { listKey: 'asc' } })
        ).map(({ listKey }) => listKey),
      ).toEqual(['top', 'top|genre=Slice of Life']);
    });

    it('serves a season with nothing announced as an empty page, from the cache afterwards', async () => {
      answer = () => ({ media: [], hasNextPage: false });
      const path = '/anime/lists/seasonal?season=WINTER&year=2027';

      const first = await list(path);
      const second = await list(path);

      expect(first).toMatchObject({
        entries: [],
        nextCursor: null,
        season: { season: 'WINTER', year: 2027 },
      });
      expect(second).toEqual(first);
      expect(requests).toHaveLength(1);
    });

    it('pages a seasonal genre list across two stored pages under one key', async () => {
      answer = (page) => ({
        media: page === 1 ? fullPage(1) : fullPage(2).slice(0, 3),
        hasNextPage: page === 1,
      });
      const base = '/anime/lists/seasonal?season=SUMMER&year=2026&genre=Drama';

      const first = await list(`${base}&limit=30`);
      const last = await list(`${base}&limit=30&cursor=${first.nextCursor}`);

      expect(first.nextCursor).toBe(encodeCursor(30));
      expect(last.entries).toHaveLength(23);
      expect(last.nextCursor).toBeNull();
      expect(last.season).toEqual({ season: 'SUMMER', year: 2026 });
      expect(requests.map(({ page, genre }) => [page, genre])).toEqual([
        [1, 'Drama'],
        [2, 'Drama'],
      ]);
      expect(
        (await prisma.animeListPage.findMany({ orderBy: { page: 'asc' } })).map(
          ({ listKey }) => listKey,
        ),
      ).toEqual([
        'seasonal|season=SUMMER|year=2026|genre=Drama',
        'seasonal|season=SUMMER|year=2026|genre=Drama',
      ]);
    });

    it('moves to the next season at the UTC year boundary, with a new source call', async () => {
      const before = await list('/anime/lists/seasonal');
      clock.advance(
        new Date('2027-01-01T00:00:00.000Z').getTime() - clock.now().getTime(),
      );

      const after = await list('/anime/lists/seasonal');

      expect(before.season).toEqual({ season: 'FALL', year: 2026 });
      expect(after.season).toEqual({ season: 'WINTER', year: 2027 });
      expect(
        requests.map(({ season, seasonYear }) => [season, seasonYear]),
      ).toEqual([
        ['FALL', 2026],
        ['WINTER', 2027],
      ]);
      expect(
        (
          await prisma.animeListPage.findMany({ orderBy: { listKey: 'asc' } })
        ).map(({ listKey }) => listKey),
      ).toEqual([
        'seasonal|season=FALL|year=2026',
        'seasonal|season=WINTER|year=2027',
      ]);
    });

    it('serves a stored seasonal page, stale, while AniList is down', async () => {
      await list('/anime/lists/seasonal');
      clock.advance(24 * HOUR_MS);
      failing = true;

      const stale = await list('/anime/lists/seasonal');
      await lists.settle();

      expect(stale).toMatchObject({
        freshness: 'stale',
        season: { season: 'FALL', year: 2026 },
      });
      expect(stale.entries).toHaveLength(24);
    });

    it('answers 400 for a season on another kind before AniList or the kill switch', async () => {
      settings.anilistEnabled = false;

      const response = await get(
        '/anime/lists/top?season=FALL&year=2026',
      ).expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          details: [{ field: 'season' }, { field: 'year' }],
        },
      });
    });
  });

  describe('cold fetch budget', () => {
    const genres = ['Action', 'Comedy', 'Drama', 'Ecchi', 'Horror', 'Music'];

    it('refuses a new list with 429 once the budget is spent, while a stored one still answers 200', async () => {
      expect(genres).toHaveLength(LIST_FETCH_BURST);
      for (const genre of genres) await list(`/anime/lists/top?genre=${genre}`);

      const refused = await get('/anime/lists/top?genre=Mecha').expect(429);
      const stored = await list('/anime/lists/top?genre=Action');

      expect(refused.body).toEqual({
        error: {
          code: 'ANIME_LIST_FETCH_LIMIT_REACHED',
          message:
            'Too many new lists are being loaded right now. Try again in a minute.',
        },
      });
      expect(stored.freshness).toBe('fresh');
      expect(requests).toHaveLength(LIST_FETCH_BURST);
    });

    it('does not spend tokens on a stale page in its retry delay', async () => {
      await prisma.animeListPage.create({
        data: {
          listKey: 'trending',
          page: 1,
          fetchedAt: new Date(clock.now().getTime() - 2 * HOUR_MS),
          hasNextPage: false,
          entries: [],
        },
      });
      failing = true;
      await list('/anime/lists/trending');
      await lists.settle();
      failing = false;

      for (let read = 0; read < LIST_FETCH_BURST + 2; read += 1) {
        await list('/anime/lists/trending');
      }
      await lists.settle();

      expect(requests).toHaveLength(1);
      expect(await list('/anime/lists/top?genre=Mecha')).toMatchObject({
        freshness: 'fresh',
      });
    });

    it('gives tokens back for fetches the limiter refused, so cold lists keep answering', async () => {
      const adapter = app.get(AniListAdapter);
      const refusing = vi
        .spyOn(adapter, 'fetchList')
        .mockRejectedValue(new SourceUnavailableError('anilist', 'queue full'));
      for (const genre of [...genres, 'Mecha']) {
        await get(`/anime/lists/top?genre=${genre}`).expect(503);
      }
      refusing.mockRestore();

      expect(await list('/anime/lists/top?genre=Mystery')).toMatchObject({
        freshness: 'fresh',
      });
    });

    it('answers 503 without a request or a token while AniList is cooling down', async () => {
      const adapter = app.get(AniListAdapter);
      const down = vi.spyOn(adapter, 'isDown').mockReturnValue(true);
      for (const genre of [...genres, 'Mecha']) {
        await get(`/anime/lists/top?genre=${genre}`).expect(503);
      }
      down.mockRestore();

      expect(requests).toHaveLength(0);
      expect(await list('/anime/lists/top?genre=Mystery')).toMatchObject({
        freshness: 'fresh',
      });
    });

    it('gives a token back after the refill step', async () => {
      for (const genre of genres) await list(`/anime/lists/top?genre=${genre}`);
      await get('/anime/lists/top?genre=Mecha').expect(429);

      clock.advance(LIST_FETCH_REFILL_MS);

      expect(await list('/anime/lists/top?genre=Mecha')).toMatchObject({
        freshness: 'fresh',
      });
    });

    it('serves a stale page without refreshing it when the budget is spent', async () => {
      await prisma.animeListPage.create({
        data: {
          listKey: 'trending',
          page: 1,
          fetchedAt: new Date(clock.now().getTime() - 2 * HOUR_MS),
          hasNextPage: false,
          entries: [],
        },
      });
      for (const genre of genres) await list(`/anime/lists/top?genre=${genre}`);

      const stale = await list('/anime/lists/trending');
      await lists.settle();

      expect(stale.freshness).toBe('stale');
      expect(requests).toHaveLength(LIST_FETCH_BURST);
    });
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
    expect(requests).toHaveLength(1);
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

  describe('slug claims (OTA-190)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const english = (id: number, title: string, extra = {}) =>
      media(id, {
        title: { romaji: `Romaji ${id}`, english: title },
        ...extra,
      });
    const claimed = async () =>
      Object.fromEntries(
        (await prisma.animeIdentity.findMany()).map((row) => [
          row.anilistId,
          row.canonicalSlug,
        ]),
      );

    it('claims a slug and the romaji alias for every listed anime on a cold page', async () => {
      answer = () => ({
        media: [english(1, 'First Show'), english(2, 'Second Show')],
        hasNextPage: false,
      });

      const page = await list('/anime/lists/top');

      expect(page.entries.map(({ slug }) => slug)).toEqual([
        'first-show',
        'second-show',
      ]);
      const slugs = await prisma.animeSlug.findMany({
        orderBy: { slug: 'asc' },
      });
      expect(slugs.map(({ slug }) => slug)).toEqual([
        'first-show',
        'romaji-1',
        'romaji-2',
        'second-show',
      ]);
      expect(await prisma.anime.count()).toBe(0);
    });

    it('claims nothing for an empty page', async () => {
      answer = () => ({ media: [], hasNextPage: false });

      expect((await list('/anime/lists/top')).entries).toEqual([]);

      expect(await prisma.animeIdentity.count()).toBe(0);
    });

    it('leaves an existing identity untouched and never re-claims a removed one', async () => {
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
      answer = () => ({
        media: [
          english(1, 'Brand New'),
          english(2, 'Other'),
          english(3, 'Third'),
        ],
        hasNextPage: false,
      });

      const page = await list('/anime/lists/top');

      expect(
        page.entries.map(({ anilistId, slug }) => [anilistId, slug]),
      ).toEqual([
        [1, 'one'],
        [3, 'third'],
      ]);
      expect(await claimed()).toEqual({ 1: 'one', 2: 'two', 3: 'third' });
      expect(
        await prisma.animeSlug.count({ where: { anilistId: { in: [1, 2] } } }),
      ).toBe(0);
    });

    it('takes the year rung when another anime holds the plain slug', async () => {
      await prisma.animeIdentity.create({
        data: { anilistId: 5, canonicalSlug: 'clash', createdAt: clock.now() },
      });
      await prisma.animeSlug.create({
        data: { slug: 'clash', anilistId: 5, createdAt: clock.now() },
      });
      answer = () => ({
        media: [
          english(6, 'Clash', { startDate: { year: 2020, month: 1, day: 1 } }),
        ],
        hasNextPage: false,
      });

      const page = await list('/anime/lists/top');

      expect(page.entries[0]?.slug).toBe('clash-2020');
    });

    it('claims in list order inside a page: the first of two equal titles gets the plain slug', async () => {
      answer = () => ({
        media: [english(12, 'Same Title'), english(11, 'Same Title')],
        hasNextPage: false,
      });

      await list('/anime/lists/top');

      expect(await claimed()).toEqual({
        12: 'same-title',
        11: 'same-title-tv',
      });
    });

    it('survives two lists claiming the same anime at once', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      answer = () => ({
        media: [
          english(1, 'Shared A'),
          english(2, 'Shared B'),
          english(3, 'Shared A'),
        ],
        hasNextPage: false,
      });

      const [top, airing] = await Promise.all([
        list('/anime/lists/top'),
        list('/anime/lists/airing'),
      ]);

      expect(await prisma.animeIdentity.count()).toBe(3);
      expect(top.entries.map(({ slug }) => slug)).toEqual(
        airing.entries.map(({ slug }) => slug),
      );
      expect(top.entries.every(({ slug }) => slug !== null)).toBe(true);
      expect(new Set(top.entries.map(({ slug }) => slug)).size).toBe(3);
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Slug claim'),
      );
    });

    it('answers 200 with null slugs when a claim fails, and heals at the next fetch', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      answer = () => ({ media: [english(1, 'Heal Me')], hasNextPage: false });
      const claimFailure = vi
        .spyOn(prisma, '$transaction')
        .mockRejectedValueOnce(new Error('boom'));

      const first = await list('/anime/lists/trending');
      claimFailure.mockRestore();
      clock.advance(HOUR_MS);
      await list('/anime/lists/trending');
      await lists.settle();
      const healed = await list('/anime/lists/trending');

      expect(first.entries[0]?.slug).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        'Slug claim failed for 1 listed anime (Error): 1',
      );
      expect(healed.entries[0]?.slug).toBe('heal-me');
    });

    it('stores the page but claims nothing for a genre or a past-season list (until OTA-189)', async () => {
      answer = () => ({ media: [english(1, 'Gated')], hasNextPage: false });

      const genre = await list('/anime/lists/top?genre=Drama');
      const past = await list('/anime/lists/seasonal?season=SUMMER&year=2025');

      expect(ids(genre)).toEqual([1]);
      expect(past.entries[0]?.slug).toBeNull();
      expect(genre.entries[0]?.slug).toBeNull();
      expect(await prisma.animeListPage.count()).toBe(2);
      expect(await prisma.animeIdentity.count()).toBe(0);
    });

    it('does no write when it serves a stored page', async () => {
      await list('/anime/lists/top');
      const transaction = vi.spyOn(prisma, '$transaction');

      await list('/anime/lists/top');

      expect(transaction).not.toHaveBeenCalled();
    });

    it('claims the new entries of a background refresh', async () => {
      answer = () => ({ media: [english(1, 'Old One')], hasNextPage: false });
      await list('/anime/lists/trending');
      clock.advance(HOUR_MS);
      answer = () => ({
        media: [english(1, 'Old One'), english(2, 'New Two')],
        hasNextPage: false,
      });

      await list('/anime/lists/trending');
      await lists.settle();

      expect(await claimed()).toEqual({ 1: 'old-one', 2: 'new-two' });
    });
  });

  describe('imported flag (OTA-191)', () => {
    const importAnime = async (anilistId: number) => {
      const animeId = `00000000-0000-4000-8000-${String(anilistId).padStart(12, '0')}`;
      await prisma.anime.create({
        data: {
          id: animeId,
          createdAt: clock.now(),
          lastViewedAt: clock.now(),
        },
      });
      await prisma.animeExternalId.create({
        data: { source: 'ANILIST', externalId: anilistId, animeId },
      });
      return animeId;
    };
    const flags = (page: AnimeListPage) =>
      page.entries.map(({ anilistId, slug, imported }) => [
        anilistId,
        slug,
        imported,
      ]);
    const twoEntries = () => ({
      media: [
        media(1, { title: { romaji: 'Alpha', english: null } }),
        media(2, { title: { romaji: 'Beta', english: null } }),
      ],
      hasNextPage: false,
    });

    it('is false for an anime that only has a claimed slug, true once it is imported', async () => {
      answer = twoEntries;

      expect(flags(await list('/anime/lists/top'))).toEqual([
        [1, 'alpha', false],
        [2, 'beta', false],
      ]);
      await importAnime(2);

      expect(flags(await list('/anime/lists/top'))).toEqual([
        [1, 'alpha', false],
        [2, 'beta', true],
      ]);
    });

    it('goes back to false when the anime is purged, the slug unchanged', async () => {
      answer = twoEntries;
      const animeId = await importAnime(1);
      expect(flags(await list('/anime/lists/top'))[0]).toEqual([
        1,
        'alpha',
        true,
      ]);

      await prisma.anime.delete({ where: { id: animeId } });

      expect(flags(await list('/anime/lists/top'))[0]).toEqual([
        1,
        'alpha',
        false,
      ]);
    });

    it('ignores an anime linked only through another source id', async () => {
      answer = twoEntries;
      const animeId = await importAnime(2);
      await prisma.animeExternalId.create({
        data: { source: 'MYANIMELIST', externalId: 1, animeId },
      });

      expect(flags(await list('/anime/lists/top'))).toEqual([
        [1, 'alpha', false],
        [2, 'beta', true],
      ]);
    });

    it('answers an empty page without asking the database for links', async () => {
      answer = () => ({ media: [], hasNextPage: false });
      const findMany = vi.spyOn(prisma.animeExternalId, 'findMany');

      expect((await list('/anime/lists/top')).entries).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });
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
    ['unknown list', '/anime/lists/recent'],
    ['malformed cursor', '/anime/lists/top?cursor=!!!'],
    ['cursor past the cap', `/anime/lists/top?cursor=${encodeCursor(1_000)}`],
    ['limit 0', '/anime/lists/top?limit=0'],
    ['limit above the maximum', '/anime/lists/top?limit=51'],
    ['fractional limit', '/anime/lists/top?limit=1.5'],
    ['unknown parameter', '/anime/lists/top?sort=score'],
    ['lower case season', '/anime/lists/seasonal?season=fall&year=2026'],
    ['unknown season', '/anime/lists/seasonal?season=AUTUMN&year=2026'],
    ['year before 1917', '/anime/lists/seasonal?season=FALL&year=1916'],
    ['year after next year', '/anime/lists/seasonal?season=FALL&year=2028'],
    ['fractional year', '/anime/lists/seasonal?season=FALL&year=2026.5'],
    ['year written 2026.0', '/anime/lists/seasonal?season=FALL&year=2026.0'],
    ['year written in hex', '/anime/lists/seasonal?season=FALL&year=0x7EA'],
    ['year with a plus sign', '/anime/lists/seasonal?season=FALL&year=%2B2026'],
    ['season without year', '/anime/lists/seasonal?season=FALL'],
    ['year without season', '/anime/lists/seasonal?year=2026'],
    ['season on another kind', '/anime/lists/top?season=FALL&year=2026'],
    ['unknown genre', '/anime/lists/top?genre=Hentai'],
    ['wrongly spelled genre', '/anime/lists/top?genre=sci-fi'],
    ['two genres', '/anime/lists/top?genre=Drama&genre=Comedy'],
  ])('rejects %s with 400 and calls nobody', async (_name, path) => {
    const response = await get(path).expect(400);

    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(requests).toHaveLength(0);
  });
});
