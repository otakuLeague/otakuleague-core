import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  AnimeBySlug,
  AnimeDataSource,
  AnimeDetails,
} from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, SequentialRandom } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { AnimeImportService } from './anime-import.service';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import {
  AnimeSourceSettings,
  type SourceSettings,
} from './sources/source-settings';

const DAY_MS = 24 * 60 * 60 * 1000;

class MovableClock extends Clock {
  private instant = new Date('2026-10-15T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

/** A local stand-in for one source, serving the recorded responses. */
interface FakeSource {
  up: boolean;
  calls: number;
  url: string;
  server: Server;
}

async function startFake(
  answer: (path: string, body: unknown) => { status: number; body: unknown },
): Promise<FakeSource> {
  const fake = { up: true, calls: 0, url: '' } as FakeSource;
  fake.server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      fake.calls += 1;
      if (!fake.up) {
        res.writeHead(503).end('{}');
        return;
      }
      const { status, body } = answer(
        req.url ?? '/',
        raw ? (JSON.parse(raw) as unknown) : null,
      );
      res
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) =>
    fake.server.listen(0, '127.0.0.1', resolve),
  );
  fake.url = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  return fake;
}

// MAL id -> recorded AniList response. Tests swap entries (e.g. an adult flag).
let aniListByMalId: Map<number, unknown>;
// More AniList entries, reachable by AniList id only (e.g. two entries sharing a MAL id).
let aniListExtra: unknown[];
const ANILIST_BY_MAL_ID = (): Map<number, unknown> =>
  new Map([
    [16498, fixture('anilist-attack-on-titan')],
    [52991, fixture('anilist-frieren')],
  ]);

class TestSourceSettings extends AnimeSourceSettings {
  readonly enabled: Record<AnimeDataSource, boolean> = {
    anilist: true,
    jikan: true,
  };

  constructor(private readonly urls: Record<AnimeDataSource, string>) {
    super();
  }

  get(source: AnimeDataSource): SourceSettings {
    return {
      enabled: this.enabled[source],
      baseUrl: this.urls[source],
      minIntervalMs: 0,
      timeoutMs: 2_000,
      maxRetryAfterMs: 1_000,
      // No cool-down, so a source switched back up answers on the next request.
      coolDownMs: 0,
      maxQueueMs: 5_000,
    };
  }
}

describe('GET /anime/:idSource/:externalId', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let importer: AnimeImportService;
  let clock: MovableClock;
  let anilist: FakeSource;
  let jikan: FakeSource;
  let settings: TestSourceSettings;

  const get = (path: string) => request(app.getHttpServer()).get(path);
  const counts = async () => ({
    anime: await prisma.anime.count(),
    ids: await prisma.animeExternalId.count(),
    snapshots: await prisma.animeSourceSnapshot.count(),
  });
  const slugsOf = async (anilistId: number) => ({
    canonical: (await prisma.animeIdentity.findUnique({ where: { anilistId } }))
      ?.canonicalSlug,
    all: (
      await prisma.animeSlug.findMany({
        where: { anilistId },
        orderBy: { slug: 'asc' },
      })
    ).map(({ slug }) => slug),
  });
  /** AniList's Attack on Titan under another id: same titles, so every slug collides. */
  const aotTwin = (id: number, title?: Record<string, string | null>) => {
    const aot = record(record(fixture('anilist-attack-on-titan')).data).Media;
    return {
      data: {
        Media: { ...record(aot), id, idMal: null, ...(title && { title }) },
      },
    };
  };

  beforeAll(async () => {
    anilist = await startFake((_path, body) => {
      const variables = record(record(body).variables);
      const malId =
        typeof variables.idMal === 'number' ? variables.idMal : null;
      const byAniListId = [...aniListByMalId.values(), ...aniListExtra].find(
        (response) =>
          record(record(record(response).data).Media).id === variables.id,
      );
      const response = malId !== null ? aniListByMalId.get(malId) : byAniListId;
      return response
        ? { status: 200, body: response }
        : { status: 404, body: fixture('anilist-not-found') };
    });
    jikan = await startFake((path) => {
      const responses: Record<string, unknown> = {
        '/v4/anime/16498': fixture('jikan-attack-on-titan'),
        '/v4/anime/52991': fixture('jikan-frieren'),
      };
      const response = responses[path];
      return response
        ? { status: 200, body: response }
        : {
            status: 404,
            body: { status: 404, message: 'Resource does not exist' },
          };
    });
    settings = new TestSourceSettings({
      anilist: anilist.url,
      jikan: `${jikan.url}/v4`,
    });
    clock = new MovableClock();
    app = await createTestApp({
      clock,
      random: new SequentialRandom(),
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    prisma = app.get(PrismaService);
    importer = app.get(AnimeImportService);
  });

  beforeEach(async () => {
    await importer.settle();
    await truncateAllTables(prisma);
    aniListByMalId = ANILIST_BY_MAL_ID();
    aniListExtra = [];
    anilist.up = true;
    jikan.up = true;
    anilist.calls = 0;
    jikan.calls = 0;
    settings.enabled.anilist = true;
    settings.enabled.jikan = true;
  });

  afterAll(async () => {
    await importer.settle();
    await app.close();
    for (const fake of [anilist, jikan]) {
      fake.server.closeAllConnections();
      await new Promise((resolve) => fake.server.close(resolve));
    }
  });

  it('imports a new anime from AniList, then fills in MAL data from Jikan', async () => {
    const first = await get('/anime/myanimelist/16498').expect(200);
    const body = first.body as AnimeDetails;

    expect(body.titleEnglish).toEqual({
      value: 'Attack on Titan',
      source: 'anilist',
      fetchedAt: '2026-10-15T12:00:00.000Z',
    });
    expect(body.trailer?.value).toEqual({ site: 'youtube', id: 'LHtdKWJdif4' });
    expect(body.synopsis?.value).not.toMatch(/[<>]/);
    expect(body.externalIds).toEqual([
      { source: 'anilist', id: '16498' },
      { source: 'myanimelist', id: '16498' },
    ]);
    // Jikan runs in the background: the first answer does not wait for it.
    expect(body.scores.map((score) => score.source)).toEqual(['anilist']);

    await importer.settle();
    const second = (await get('/anime/anilist/16498').expect(200))
      .body as AnimeDetails;

    expect(second.id).toBe(body.id);
    expect(second.scores).toEqual([
      expect.objectContaining({ source: 'anilist', score: 85, scale: 100 }),
      expect.objectContaining({
        source: 'jikan',
        score: 8.57,
        scale: 10,
        rank: 117,
        members: 4275990,
      }),
    ]);
    expect(
      second.attributions.map((attribution) => attribution.source),
    ).toEqual(['anilist', 'jikan']);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  it('serves a fresh anime from the database without calling the sources again', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();

    await get('/anime/myanimelist/16498').expect(200);
    await get('/anime/anilist/16498').expect(200);
    await importer.settle();

    expect([anilist.calls, jikan.calls]).toEqual([1, 1]);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  it('re-imports stale data in place: same anime, same rows, new fetch time', async () => {
    const before = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();
    clock.advance(8 * DAY_MS);

    const stale = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();
    const after = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;

    // The stale page is served at once; the refresh lands for the next request.
    expect(stale.titleEnglish?.fetchedAt).toBe('2026-10-15T12:00:00.000Z');
    expect(after.id).toBe(before.id);
    expect(after.titleEnglish?.fetchedAt).toBe('2026-10-23T12:00:00.000Z');
    expect([anilist.calls, jikan.calls]).toEqual([2, 2]);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  it('runs one import for concurrent requests of the same new anime', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => get('/anime/myanimelist/52991')),
    );
    await importer.settle();

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(
      new Set(responses.map((response) => (response.body as AnimeDetails).id))
        .size,
    ).toBe(1);
    expect(anilist.calls).toBe(1);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  it('does not call the source again for an import that starts just after another finished', async () => {
    // A request that missed the anime, then reached importNew once the first import was done.
    const first = await importer.importNew({
      source: 'myanimelist',
      externalId: 52991,
    });
    const late = await importer.importNew({
      source: 'myanimelist',
      externalId: 52991,
    });
    await importer.settle();

    expect(late).toBe(first);
    expect(anilist.calls).toBe(1);
  });

  it('ends with one anime when two API processes import it at the same time', async () => {
    // A second app on the same database: its own in-process import map, like another server.
    const other = await createTestApp({
      clock,
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    try {
      const [mine, theirs] = await Promise.all([
        get('/anime/myanimelist/52991'),
        request(other.getHttpServer()).get('/anime/myanimelist/52991'),
      ]);
      await importer.settle();
      await other.get(AnimeImportService).settle();

      expect([mine.status, theirs.status]).toEqual([200, 200]);
      expect((theirs.body as AnimeDetails).id).toBe(
        (mine.body as AnimeDetails).id,
      );
      expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
      expect(await slugsOf(154587)).toEqual({
        canonical: 'frieren-beyond-journeys-end',
        all: ['frieren-beyond-journeys-end', 'sousou-no-frieren'],
      });
    } finally {
      await other.close();
    }
  });

  it('gives two anime imported at once by two processes two different slugs', async () => {
    aniListExtra.push(aotTwin(99001));
    const other = await createTestApp({
      clock,
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    try {
      const [mine, theirs] = await Promise.all([
        get('/anime/anilist/16498'),
        request(other.getHttpServer()).get('/anime/anilist/99001'),
      ]);
      await importer.settle();
      await other.get(AnimeImportService).settle();

      expect([mine.status, theirs.status]).toEqual([200, 200]);
      const canonicals = [
        (await slugsOf(16498)).canonical,
        (await slugsOf(99001)).canonical,
      ];
      expect(canonicals.toSorted()).toEqual([
        'attack-on-titan',
        'attack-on-titan-2013',
      ]);
    } finally {
      await other.close();
    }
  });

  it('imports and serves from AniList alone while Jikan is down, then fills in when it is back', async () => {
    jikan.up = false;

    const down = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();

    expect(down.titleEnglish?.source).toBe('anilist');
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 1 });

    jikan.up = true;
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();
    const back = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;

    expect(back.scores.map((score) => score.source)).toEqual([
      'anilist',
      'jikan',
    ]);
  });

  it('keeps serving cached data when AniList is down', async () => {
    const cached = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();
    anilist.up = false;
    clock.advance(8 * DAY_MS);

    const response = await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();

    expect((response.body as AnimeDetails).titleEnglish).toEqual(
      cached.titleEnglish,
    );
    expect(anilist.calls).toBe(2);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  it('answers 503 for a new anime when its sources are down, and stores nothing', async () => {
    anilist.up = false;

    const response = await get('/anime/anilist/16498').expect(503);

    expect(response.body).toEqual({
      error: {
        code: 'ANIME_SOURCES_UNAVAILABLE',
        message: 'The anime data sources are unavailable. Try again later.',
      },
    });
    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
  });

  it('hides a switched-off source everywhere, keeps its data, and shows it again when back on', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();
    settings.enabled.jikan = false;

    const off = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;

    expect(JSON.stringify(off)).not.toContain('"jikan"');
    // AniList also vouches for the MAL id, so both ids stay.
    expect(off.externalIds.map((id) => id.source)).toEqual([
      'anilist',
      'myanimelist',
    ]);
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });

    settings.enabled.jikan = true;
    const on = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;

    expect(on.scores.map((score) => score.source)).toEqual([
      'anilist',
      'jikan',
    ]);
  });

  it('serves Jikan values alone when AniList is switched off', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();
    settings.enabled.anilist = false;
    const callsBefore = anilist.calls;

    const body = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;

    expect(body.titleEnglish).toEqual(
      expect.objectContaining({ value: 'Attack on Titan', source: 'jikan' }),
    );
    expect(body.bannerImageUrl).toBeNull();
    // The AniList id came from AniList: hidden, and no longer an address for the anime.
    expect(body.externalIds).toEqual([{ source: 'myanimelist', id: '16498' }]);
    const byAniListId = await get('/anime/anilist/16498').expect(404);
    expect(byAniListId.body).toMatchObject({
      error: { code: 'ANIME_NOT_FOUND' },
    });
    expect(anilist.calls).toBe(callsBefore);
  });

  it('answers 404 for an id no source knows', async () => {
    await get('/anime/anilist/999999999').expect(404);
    await get('/anime/myanimelist/1').expect(404);

    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
  });

  it('deletes an anime that a source flags adult on a later refresh', async () => {
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: true } },
    });
    clock.advance(8 * DAY_MS);

    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();

    // Jikan's snapshot does not keep it alive: the whole anime is gone.
    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
    await get('/anime/anilist/154587').expect(404);
  });

  it('keeps two AniList entries that share a MAL id as two anime', async () => {
    const aot = record(record(fixture('anilist-attack-on-titan')).data).Media;
    aniListExtra.push({
      data: {
        Media: { ...record(aot), id: 99001, title: { romaji: 'Part 2' } },
      },
    });
    const first = (await get('/anime/anilist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();

    const second = (await get('/anime/anilist/99001').expect(200))
      .body as AnimeDetails;
    await importer.settle();
    const firstAgain = (await get('/anime/anilist/16498').expect(200))
      .body as AnimeDetails;

    expect(second.id).not.toBe(first.id);
    expect(second.titleRomaji?.value).toBe('Part 2');
    // The MAL id stays with the anime that had it first; the second one does not steal it.
    expect(second.externalIds).toEqual([{ source: 'anilist', id: '99001' }]);
    expect(firstAgain.titleRomaji?.value).toBe('Shingeki no Kyojin');
    expect(await counts()).toEqual({ anime: 2, ids: 3, snapshots: 3 });
  });

  it('does not ask a source again before the TTL once it said "not found"', async () => {
    // Minami-ke: AniList knows it, Jikan's fake does not.
    aniListByMalId.set(2963, fixture('anilist-minami-ke'));

    await get('/anime/myanimelist/2963').expect(200);
    await importer.settle();
    await get('/anime/myanimelist/2963').expect(200);
    await get('/anime/myanimelist/2963').expect(200);
    await importer.settle();

    expect(jikan.calls).toBe(1);
  });

  it('never stores or shows adult entries', async () => {
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: true } },
    });

    await get('/anime/myanimelist/52991').expect(404);
    await importer.settle();

    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
    expect(await prisma.animeIdentity.count()).toBe(0);
  });

  it('claims the English slug and the romaji alias on import', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();

    expect(await slugsOf(16498)).toEqual({
      canonical: 'attack-on-titan',
      all: ['attack-on-titan', 'shingeki-no-kyojin'],
    });
  });

  it('gives a later anime with the same title the next free rung, and no alias already taken', async () => {
    aniListExtra.push(aotTwin(99001));
    await get('/anime/anilist/16498').expect(200);
    await get('/anime/anilist/99001').expect(200);
    await importer.settle();

    expect(await slugsOf(99001)).toEqual({
      canonical: 'attack-on-titan-2013',
      all: ['attack-on-titan-2013'],
    });
    expect((await slugsOf(16498)).canonical).toBe('attack-on-titan');
  });

  it('moves the canonical slug when the English title arrives, and keeps the old one', async () => {
    aniListByMalId.set(2963, fixture('anilist-minami-ke'));
    await get('/anime/myanimelist/2963').expect(200);
    await importer.settle();
    expect(await slugsOf(2963)).toEqual({
      canonical: 'minami-ke',
      all: ['minami-ke'],
    });

    const minamike = record(record(fixture('anilist-minami-ke')).data).Media;
    aniListByMalId.set(2963, {
      data: {
        Media: {
          ...record(minamike),
          title: {
            ...record(record(minamike).title),
            english: 'The Minami Family',
          },
        },
      },
    });
    clock.advance(8 * DAY_MS);
    await get('/anime/myanimelist/2963').expect(200);
    await importer.settle();

    expect(await slugsOf(2963)).toEqual({
      canonical: 'the-minami-family',
      all: ['minami-ke', 'the-minami-family'],
    });
    // The former canonical now redirects through the endpoint.
    expect((await get('/anime/slugs/minami-ke').expect(200)).body).toEqual({
      kind: 'redirect',
      canonicalSlug: 'the-minami-family',
    } satisfies AnimeBySlug);

    // Back to the old title: its slug is already this anime's, so it is reused, not added.
    aniListByMalId.set(2963, fixture('anilist-minami-ke'));
    clock.advance(8 * DAY_MS);
    await get('/anime/myanimelist/2963').expect(200);
    await importer.settle();

    expect(await slugsOf(2963)).toEqual({
      canonical: 'minami-ke',
      all: ['minami-ke', 'the-minami-family'],
    });
  });

  it('gives no slug to an anime imported from Jikan alone', async () => {
    settings.enabled.anilist = false;
    const body = (await get('/anime/myanimelist/16498').expect(200))
      .body as AnimeDetails;
    await importer.settle();

    expect(body.canonicalSlug).toBeNull();
    expect(await prisma.animeIdentity.count()).toBe(0);
    expect(await prisma.animeSlug.count()).toBe(0);
  });

  it('marks a purged anime removed when its re-import comes back adult', async () => {
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    clock.advance(31 * DAY_MS);
    expect(await importer.purgeUnviewed()).toBe(1);
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: true } },
    });

    await get('/anime/myanimelist/52991').expect(404);

    expect(
      (await prisma.animeIdentity.findUnique({ where: { anilistId: 154587 } }))
        ?.removedAt,
    ).toEqual(clock.now());
  });

  it('keeps the slugs through the purge and reuses them on re-import', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();
    clock.advance(31 * DAY_MS);
    expect(await importer.purgeUnviewed()).toBe(1);

    expect((await slugsOf(16498)).all).toHaveLength(2);
    await get('/anime/anilist/16498').expect(200);
    await importer.settle();

    expect(await slugsOf(16498)).toEqual({
      canonical: 'attack-on-titan',
      all: ['attack-on-titan', 'shingeki-no-kyojin'],
    });
  });

  it('never imports again an anime deleted for being adult, though its slugs stay', async () => {
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: true } },
    });
    clock.advance(8 * DAY_MS);
    const flaggedAt = clock.now();
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();

    // Even if the source drops the flag, a removed anime does not come back.
    aniListByMalId = ANILIST_BY_MAL_ID();
    await get('/anime/anilist/154587').expect(404);
    await importer.settle();

    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
    expect(
      (await prisma.animeIdentity.findUnique({ where: { anilistId: 154587 } }))
        ?.removedAt,
    ).toEqual(flaggedAt);
    expect((await slugsOf(154587)).all).toHaveLength(2);
  });

  it('deletes a removed anime stored through Jikan while AniList was down, once AniList answers', async () => {
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: true } },
    });
    clock.advance(8 * DAY_MS);
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    aniListByMalId = ANILIST_BY_MAL_ID();

    anilist.up = false;
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    anilist.up = true;
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();

    expect(await counts()).toEqual({ anime: 0, ids: 0, snapshots: 0 });
  });

  describe('GET /anime/slugs/:slug', () => {
    const bySlug = (slug: string) => get(`/anime/slugs/${slug}`);

    it('serves the anime by its canonical slug and redirects its other slugs', async () => {
      const first = (await get('/anime/myanimelist/16498').expect(200))
        .body as AnimeDetails;
      await importer.settle();

      expect(first.canonicalSlug).toBe('attack-on-titan');
      expect((await bySlug('attack-on-titan').expect(200)).body).toMatchObject({
        kind: 'anime',
        anime: { id: first.id, canonicalSlug: 'attack-on-titan' },
      } satisfies { kind: 'anime'; anime: Partial<AnimeDetails> });
      for (const other of [
        'shingeki-no-kyojin',
        'Attack-On-Titan',
        'SHINGEKI-no-kyojin',
      ]) {
        expect((await bySlug(other).expect(200)).body).toEqual({
          kind: 'redirect',
          canonicalSlug: 'attack-on-titan',
        } satisfies AnimeBySlug);
      }
    });

    it('answers 404 for an unknown slug and 400 for a malformed one', async () => {
      const unknown = await bySlug('no-such-anime').expect(404);

      expect(unknown.body).toMatchObject({
        error: { code: 'ANIME_NOT_FOUND' },
      });
      // 80 characters is the longest slug: well-formed, so unknown rather than malformed.
      await bySlug('a'.repeat(80)).expect(404);
      for (const malformed of ['a--b', '-a', 'a_b', 'é', 'a'.repeat(81)]) {
        await bySlug(encodeURIComponent(malformed)).expect(400);
      }
    });

    it('serves stale data by slug at once and refreshes it in the background', async () => {
      const imported = (await get('/anime/myanimelist/16498').expect(200))
        .body as AnimeDetails;
      await importer.settle();
      clock.advance(8 * DAY_MS);

      const stale = (await bySlug('attack-on-titan').expect(200))
        .body as Extract<AnimeBySlug, { kind: 'anime' }>;
      await importer.settle();

      const refreshed = (await get('/anime/anilist/16498').expect(200))
        .body as AnimeDetails;

      expect(stale.anime.titleEnglish).toEqual(imported.titleEnglish);
      expect(refreshed.titleEnglish?.fetchedAt).toBe(clock.now().toISOString());
      expect([anilist.calls, jikan.calls]).toEqual([2, 2]);
    });

    it('re-imports a purged anime from its slug', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
      clock.advance(31 * DAY_MS);
      expect(await importer.purgeUnviewed()).toBe(1);

      const body = (await bySlug('attack-on-titan').expect(200))
        .body as AnimeBySlug;
      await importer.settle();

      expect(body.kind).toBe('anime');
      expect(await prisma.anime.count()).toBe(1);
    });

    it('keeps serving a slug with AniList switched off, from the other source', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
      settings.enabled.anilist = false;

      const served = (await bySlug('attack-on-titan').expect(200))
        .body as Extract<AnimeBySlug, { kind: 'anime' }>;

      expect(served.anime.attributions.map(({ source }) => source)).toEqual([
        'jikan',
      ]);
      expect(served.anime.canonicalSlug).toBe('attack-on-titan');
      // The AniList id itself is hidden with its source; the slug is ours.
      await get('/anime/anilist/16498').expect(404);
    });

    it('redirects when re-importing a purged anime moves its canonical slug', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
      clock.advance(31 * DAY_MS);
      expect(await importer.purgeUnviewed()).toBe(1);
      const aot = record(record(fixture('anilist-attack-on-titan')).data).Media;
      aniListByMalId.set(16498, {
        data: {
          Media: {
            ...record(aot),
            title: {
              ...record(record(aot).title),
              english: 'Attack on Titan Final',
            },
          },
        },
      });

      expect((await bySlug('attack-on-titan').expect(200)).body).toEqual({
        kind: 'redirect',
        canonicalSlug: 'attack-on-titan-final',
      } satisfies AnimeBySlug);
      await importer.settle();
    });

    it('answers 404 for a removed anime without calling any source', async () => {
      await get('/anime/myanimelist/52991').expect(200);
      await importer.settle();
      const frieren = record(record(fixture('anilist-frieren')).data).Media;
      aniListByMalId.set(52991, {
        data: { Media: { ...record(frieren), isAdult: true } },
      });
      clock.advance(8 * DAY_MS);
      await get('/anime/myanimelist/52991').expect(200);
      await importer.settle();
      anilist.calls = 0;
      jikan.calls = 0;

      await bySlug('frieren-beyond-journeys-end').expect(404);

      expect(anilist.calls + jikan.calls).toBe(0);
    });
  });

  it('rejects an unknown id source or a non-numeric id', async () => {
    const source = await get('/anime/kitsu/1').expect(400);
    await get('/anime/anilist/abc').expect(400);
    await get('/anime/anilist/0').expect(400);

    expect(source.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('purges anime nobody opened for 30 days, and keeps the others', async () => {
    await get('/anime/myanimelist/16498').expect(200);
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    clock.advance(20 * DAY_MS);
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    clock.advance(11 * DAY_MS);

    expect(await importer.purgeUnviewed()).toBe(1);
    expect(
      await prisma.animeExternalId.findMany({ select: { externalId: true } }),
    ).toEqual(expect.arrayContaining([{ externalId: 52991 }]));
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });
});
