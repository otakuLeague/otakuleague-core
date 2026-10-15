import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { AnimeDataSource, AnimeDetails } from '@otakuleague/shared-types';
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
