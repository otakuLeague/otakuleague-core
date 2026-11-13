import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  AnimeBySlug,
  AnimeDataSource,
  AnimeDetails,
  AnimeSlugResolution,
} from '@otakuleague/shared-types';
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
import {
  type ApiCaller,
  OPEN_CALLER,
  type VisitorKey,
  visitorKeyFromClientIp,
} from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import { InternalKeySettings } from '../common/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, SequentialRandom } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { AnimeImportService } from './anime-import.service';
import { ImportLimits, type VisitorTake } from './import-limits';
import { AniListAdapter } from './sources/anilist.adapter';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import {
  type AnimeRef,
  COOLING_DOWN_REASON,
  SourceUnavailableError,
} from './sources/source.types';
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

/** The app is shared by every test, so each test starts with a full bucket and no memory. */
class ResettableImportLimits extends ImportLimits {
  private current: ImportLimits;

  constructor(private readonly testClock: Clock) {
    super(testClock);
    this.current = new ImportLimits(testClock);
  }

  reset(): void {
    this.current = new ImportLimits(this.testClock);
  }

  override isKnownMissing(ref: AnimeRef): boolean {
    return this.current.isKnownMissing(ref);
  }

  override rememberMissing(ref: AnimeRef): void {
    this.current.rememberMissing(ref);
  }

  override takeImportToken(): boolean {
    return this.current.takeImportToken();
  }

  override giveBackImportToken(): void {
    this.current.giveBackImportToken();
  }

  override takeVisitorToken(key: VisitorKey): VisitorTake {
    return this.current.takeVisitorToken(key);
  }

  override giveBackVisitorToken(key: VisitorKey): void {
    this.current.giveBackVisitorToken(key);
  }

  override visitorCount(): number {
    return this.current.visitorCount();
  }
}

/** Obvious fake of a valid shape (64 characters, like `openssl rand -hex 32`). */
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');

/** A web caller as the guard records it; documentation addresses only (RFC 5737, RFC 3849). */
function webCaller(clientIp: string): ApiCaller {
  return { kind: 'web', visitorKey: visitorKeyFromClientIp(clientIp) };
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
  let limits: ResettableImportLimits;

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
    limits = new ResettableImportLimits(clock);
    app = await createTestApp({
      clock,
      random: new SequentialRandom(),
      overrides: [
        { provide: AnimeSourceSettings, useValue: settings },
        { provide: ImportLimits, useValue: limits },
      ],
    });
    prisma = app.get(PrismaService);
    importer = app.get(AnimeImportService);
  });

  beforeEach(async () => {
    await importer.settle();
    await truncateAllTables(prisma);
    limits.reset();
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
    expect(body).toMatchObject({
      creators: { value: ['Hajime Isayama'], source: 'anilist' },
      favourites: { value: 80474, source: 'anilist' },
      rankRated: { value: 69, source: 'anilist' },
      rankPopular: { value: 1, source: 'anilist' },
      coverColor: { value: '#f1a143', source: 'anilist' },
    });
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
    const first = await importer.importNew(
      { source: 'myanimelist', externalId: 52991 },
      OPEN_CALLER,
    );
    const late = await importer.importNew(
      { source: 'myanimelist', externalId: 52991 },
      OPEN_CALLER,
    );
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

  it('keeps an anime whose refresh answers without isAdult, does not remove it, and backs off', async () => {
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    const frieren = record(record(fixture('anilist-frieren')).data).Media;
    aniListByMalId.set(52991, {
      data: { Media: { ...record(frieren), isAdult: null } },
    });
    clock.advance(8 * DAY_MS);

    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();

    // Backed off: the next view of the still-stale anime costs no AniList call.
    const callsAfterRefresh = anilist.calls;
    await get('/anime/myanimelist/52991').expect(200);
    await importer.settle();
    expect(anilist.calls).toBe(callsAfterRefresh);

    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
    expect(
      (await prisma.animeIdentity.findUnique({ where: { anilistId: 154587 } }))
        ?.removedAt,
    ).toBeNull();
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

    // A new English title whose slug is already this anime's: reused, never a lower rung.
    aniListByMalId.set(2963, {
      data: {
        Media: {
          ...record(minamike),
          title: { ...record(record(minamike).title), english: 'Minami-ke' },
        },
      },
    });
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

  it('never moves the canonical when the English title disappears, then comes back', async () => {
    const aot = record(record(fixture('anilist-attack-on-titan')).data).Media;
    const withEnglish = (english: string | null) => ({
      data: {
        Media: {
          ...record(aot),
          title: { ...record(record(aot).title), english },
        },
      },
    });
    const slugTable = async () => ({
      canonical: (await slugsOf(16498)).canonical,
      rows: (
        await prisma.animeSlug.findMany({
          orderBy: { slug: 'asc' },
          select: { slug: true, anilistId: true },
        })
      ).map(({ slug, anilistId }) => `${slug} -> ${anilistId}`),
    });
    const expected = {
      canonical: 'attack-on-titan',
      rows: ['attack-on-titan -> 16498', 'shingeki-no-kyojin -> 16498'],
    };
    const refreshWith = async (english: string | null) => {
      aniListByMalId.set(16498, withEnglish(english));
      clock.advance(8 * DAY_MS);
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
    };

    await get('/anime/myanimelist/16498').expect(200);
    await importer.settle();
    expect(await slugTable()).toEqual(expected);
    await refreshWith(null);
    expect(await slugTable()).toEqual(expected);
    // The refresh did store AniList's null title: the canonical stayed on purpose.
    expect(
      (
        await prisma.animeSourceSnapshot.findFirst({
          where: { source: 'ANILIST' },
        })
      )?.titleEnglish,
    ).toBeNull();
    await refreshWith(null);
    expect(await slugTable()).toEqual(expected);
    await refreshWith('Attack on Titan');
    expect(await slugTable()).toEqual(expected);
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

  describe('GET /anime/slugs/:slug/resolve', () => {
    const resolve = (slug: string) => get(`/anime/slugs/${slug}/resolve`);

    it('names the anime and its canonical slug for any slug of it, any letter case', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();

      for (const slug of [
        'attack-on-titan',
        'shingeki-no-kyojin',
        'Attack-On-Titan',
      ]) {
        expect((await resolve(slug).expect(200)).body).toEqual({
          anilistId: 16498,
          canonicalSlug: 'attack-on-titan',
        } satisfies AnimeSlugResolution);
      }
    });

    it('resolves a purged anime from the database, without any source call', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
      clock.advance(31 * DAY_MS);
      expect(await importer.purgeUnviewed()).toBe(1);
      anilist.calls = 0;
      jikan.calls = 0;

      expect((await resolve('shingeki-no-kyojin').expect(200)).body).toEqual({
        anilistId: 16498,
        canonicalSlug: 'attack-on-titan',
      });
      await importer.settle();
      expect(anilist.calls + jikan.calls).toBe(0);
      expect(await prisma.anime.count()).toBe(0);
    });

    it('answers 404 for an unknown slug or a removed anime', async () => {
      await get('/anime/myanimelist/16498').expect(200);
      await importer.settle();
      await prisma.animeIdentity.update({
        where: { anilistId: 16498 },
        data: { removedAt: clock.now() },
      });

      await resolve('attack-on-titan').expect(404);
      expect((await resolve('no-such-anime').expect(404)).body).toMatchObject({
        error: { code: 'ANIME_NOT_FOUND' },
      });
    });
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
    await get('/anime/slugs/frieren-beyond-journeys-end').expect(200);
    await importer.settle();
    clock.advance(11 * DAY_MS);

    expect(await importer.purgeUnviewed()).toBe(1);
    expect(
      await prisma.animeExternalId.findMany({ select: { externalId: true } }),
    ).toEqual(expect.arrayContaining([{ externalId: 52991 }]));
    expect(await counts()).toEqual({ anime: 1, ids: 2, snapshots: 2 });
  });

  describe('import guard (OTA-173)', () => {
    const MISSING_ID = 888_001;
    const HOUR_MS = 60 * 60 * 1000;
    const body = (response: request.Response) =>
      response.body as { error: { code: string } };

    it('remembers an unknown id for an hour: no source call, then asks again', async () => {
      await get(`/anime/anilist/${MISSING_ID}`).expect(404);
      const asked = anilist.calls;

      await get(`/anime/anilist/${MISSING_ID}`).expect(404);
      clock.advance(HOUR_MS - 1);
      await get(`/anime/anilist/${MISSING_ID}`).expect(404);
      expect(anilist.calls).toBe(asked);

      clock.advance(1);
      await get(`/anime/anilist/${MISSING_ID}`).expect(404);
      expect(anilist.calls).toBeGreaterThan(asked);
    });

    it('remembers an adult id the same way', async () => {
      const frieren = record(record(fixture('anilist-frieren')).data).Media;
      aniListByMalId.set(52991, {
        data: { Media: { ...record(frieren), isAdult: true } },
      });
      await get('/anime/anilist/154587').expect(404);
      const asked = anilist.calls;

      await get('/anime/anilist/154587').expect(404);
      expect(anilist.calls).toBe(asked);

      clock.advance(HOUR_MS);
      await get('/anime/anilist/154587').expect(404);
      expect(anilist.calls).toBeGreaterThan(asked);
    });

    it('never remembers an outage: the id imports once AniList is back', async () => {
      anilist.up = false;
      const down = await get('/anime/anilist/154587').expect(503);
      expect(body(down).error.code).toBe('ANIME_SOURCES_UNAVAILABLE');

      anilist.up = true;
      await get('/anime/anilist/154587').expect(200);
      await importer.settle();
    });

    it('answers 429 once 10 cold imports are used, but still serves and refreshes stored anime', async () => {
      await get('/anime/myanimelist/52991').expect(200);
      await importer.settle();
      clock.advance(8 * DAY_MS);
      limits.reset();
      for (let id = 0; id < 10; id += 1) {
        await get(`/anime/anilist/${MISSING_ID + id}`).expect(404);
      }

      const refused = await get(`/anime/anilist/${MISSING_ID + 10}`).expect(
        429,
      );
      expect(refused.body).toEqual({
        error: {
          code: 'ANIME_IMPORT_LIMIT_REACHED',
          message:
            'Too many new anime are being imported right now. Try again in a moment.',
        },
      });

      anilist.calls = 0;
      await get('/anime/myanimelist/52991').expect(200);
      await importer.settle();
      expect(anilist.calls).toBeGreaterThan(0);

      clock.advance(19_999);
      await get(`/anime/anilist/${MISSING_ID + 10}`).expect(429);
      clock.advance(1);
      await get(`/anime/anilist/${MISSING_ID + 10}`).expect(404);
    });

    it('takes one token per id however many requests ask at once', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          get(`/anime/anilist/${MISSING_ID}`).expect(404),
        ),
      );
      for (let id = 1; id < 10; id += 1) {
        await get(`/anime/anilist/${MISSING_ID + id}`).expect(404);
      }

      await get(`/anime/anilist/${MISSING_ID + 10}`).expect(429);
    });

    it('takes no token for an id already remembered as missing', async () => {
      for (let id = 0; id < 10; id += 1) {
        await get(`/anime/anilist/${MISSING_ID + id}`).expect(404);
      }
      await get(`/anime/anilist/${MISSING_ID + 10}`).expect(429);

      await get(`/anime/anilist/${MISSING_ID}`).expect(404);
    });

    it('moves lastViewedAt for a slug page view, not for an id lookup', async () => {
      await get('/anime/myanimelist/52991').expect(200);
      await importer.settle();
      const viewedAt = async () =>
        (await prisma.anime.findFirstOrThrow()).lastViewedAt;
      const imported = await viewedAt();

      clock.advance(2 * HOUR_MS);
      await get('/anime/myanimelist/52991').expect(200);
      await get('/anime/anilist/154587').expect(200);
      expect(await viewedAt()).toEqual(imported);

      await get('/anime/slugs/frieren-beyond-journeys-end').expect(200);
      expect(await viewedAt()).toEqual(clock.now());
    });
  });

  describe('per-visitor import limit (ADR 0019)', () => {
    const MISSING_ID = 889_001;
    const ALICE_IP = '203.0.113.7';
    const alice = webCaller(ALICE_IP);
    const bob = webCaller('198.51.100.9');
    const frieren: AnimeRef = { source: 'myanimelist', externalId: 52991 };
    const missing = (offset: number): AnimeRef => ({
      source: 'anilist',
      externalId: MISSING_ID + offset,
    });
    const visitorLimited = {
      error: { code: 'ANIME_IMPORT_VISITOR_LIMIT_REACHED' },
    };
    const notFound = { error: { code: 'ANIME_NOT_FOUND' } };
    /** Spends what is left: only at the end of a test. */
    const visitorTokensLeft = (clientIp: string) => {
      const key = visitorKeyFromClientIp(clientIp);
      let left = 0;
      while (limits.takeVisitorToken(key).taken) left += 1;
      return left;
    };
    const globalTokensLeft = () => {
      let left = 0;
      while (limits.takeImportToken()) left += 1;
      return left;
    };
    const useUp = async (caller: ApiCaller) => {
      for (let offset = 0; offset < 5; offset += 1) {
        await expect(
          importer.importNew(missing(offset), caller),
        ).rejects.toMatchObject(notFound);
      }
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("refuses a visitor's 6th cold import with its own code; another visitor still imports", async () => {
      await useUp(alice);
      const calls = anilist.calls;

      await expect(importer.importNew(missing(5), alice)).rejects.toMatchObject(
        { ...visitorLimited, retryAfterSeconds: 40 },
      );
      expect(anilist.calls).toBe(calls);
      await expect(importer.importNew(frieren, bob)).resolves.toEqual(
        expect.any(String),
      );
      await importer.settle();
    });

    it('skips the visitor bucket for an open caller; the global 429 carries Retry-After 20', async () => {
      for (let offset = 0; offset < 10; offset += 1) {
        await get(`/anime/anilist/${MISSING_ID + offset}`).expect(404);
      }

      const refused = await get(`/anime/anilist/${MISSING_ID + 10}`).expect(
        429,
      );
      expect(refused.headers['retry-after']).toBe('20');
      expect(refused.body).toMatchObject({
        error: { code: 'ANIME_IMPORT_LIMIT_REACHED' },
      });
      expect(limits.visitorCount()).toBe(0);
    });

    it('lets a limited visitor join an import already running, for free', async () => {
      await useUp(alice);

      const started = importer.importNew(frieren, bob);
      const joined = importer.importNew(frieren, alice);

      const [startedId, joinedId] = await Promise.all([started, joined]);
      expect(joinedId).toBe(startedId);
      await importer.settle();
    });

    it("sends a limited starter's 429 to it alone: the next caller of that id imports", async () => {
      await useUp(alice);

      const refused = importer.importNew(frieren, alice);
      const imported = importer.importNew(frieren, bob);

      await expect(refused).rejects.toMatchObject(visitorLimited);
      await expect(imported).resolves.toEqual(expect.any(String));
      await importer.settle();
    });

    it('gives the visitor token back for a stored anime', async () => {
      const id = await importer.importNew(frieren, OPEN_CALLER);
      await importer.settle();

      await expect(importer.importNew(frieren, alice)).resolves.toBe(id);
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
    });

    it('gives the visitor token back for an id known missing', async () => {
      await expect(
        importer.importNew(missing(0), OPEN_CALLER),
      ).rejects.toMatchObject(notFound);
      const calls = anilist.calls;

      await expect(importer.importNew(missing(0), alice)).rejects.toMatchObject(
        notFound,
      );
      expect(anilist.calls).toBe(calls);
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
    });

    it('gives the visitor token back for a removed anime', async () => {
      await prisma.animeIdentity.create({
        data: {
          anilistId: MISSING_ID,
          canonicalSlug: 'removed-visitor-limit-test',
          createdAt: clock.now(),
          removedAt: clock.now(),
        },
      });

      await expect(importer.importNew(missing(0), alice)).rejects.toMatchObject(
        notFound,
      );
      expect(anilist.calls).toBe(0);
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
    });

    it('gives the visitor token back when the global bucket is empty', async () => {
      expect(globalTokensLeft()).toBe(10);

      await expect(importer.importNew(missing(0), alice)).rejects.toMatchObject(
        {
          error: { code: 'ANIME_IMPORT_LIMIT_REACHED' },
          retryAfterSeconds: 20,
        },
      );
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
    });

    it('gives both tokens back when AniList refuses before sending (cool-down)', async () => {
      vi.spyOn(app.get(AniListAdapter), 'fetchAnime').mockRejectedValueOnce(
        new SourceUnavailableError('anilist', COOLING_DOWN_REASON),
      );

      await expect(importer.importNew(missing(0), alice)).rejects.toMatchObject(
        { error: { code: 'ANIME_SOURCES_UNAVAILABLE' } },
      );
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
      expect(globalTokensLeft()).toBe(10);
    });

    it('gives both tokens back for an entry backed off after an unusable answer', async () => {
      // An id of its own: the backoff outlives this test (SourceBackoff is not reset).
      const unusable = missing(50);
      const media = record(record(fixture('anilist-frieren')).data).Media;
      aniListExtra = [
        {
          data: {
            Media: {
              ...record(media),
              id: unusable.externalId,
              idMal: null,
              isAdult: null,
            },
          },
        },
      ];
      await expect(
        importer.importNew(unusable, OPEN_CALLER),
      ).rejects.toMatchObject({ error: { code: 'ANIME_SOURCES_UNAVAILABLE' } });
      const calls = anilist.calls;

      await expect(importer.importNew(unusable, alice)).rejects.toMatchObject({
        error: { code: 'ANIME_SOURCES_UNAVAILABLE' },
      });
      expect(anilist.calls).toBe(calls);
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
      // The first import sent its request: that one global token stays spent.
      expect(globalTokensLeft()).toBe(9);
    });

    it('gives the visitor token back when the database fails before any source call', async () => {
      vi.spyOn(prisma.animeExternalId, 'findUnique').mockRejectedValueOnce(
        new Error('database lost'),
      );

      await expect(importer.importNew(missing(0), alice)).rejects.toThrow(
        'database lost',
      );
      expect(anilist.calls).toBe(0);
      expect(visitorTokensLeft(ALICE_IP)).toBe(5);
      expect(globalTokensLeft()).toBe(10);
    });

    it('keeps both tokens spent when AniList refuses before sending but Jikan is asked', async () => {
      vi.spyOn(app.get(AniListAdapter), 'fetchAnime').mockRejectedValueOnce(
        new SourceUnavailableError('anilist', COOLING_DOWN_REASON),
      );

      // A MAL id: AniList first (refused, nothing sent), then Jikan (asked, answers 404).
      await expect(
        importer.importNew(
          { source: 'myanimelist', externalId: MISSING_ID },
          alice,
        ),
      ).rejects.toMatchObject(notFound);
      expect(jikan.calls).toBe(1);
      expect(visitorTokensLeft(ALICE_IP)).toBe(4);
      expect(globalTokensLeft()).toBe(9);
    });

    it.each<[string, () => void]>([
      [
        'the adapter throws a plain error',
        () => {
          vi.spyOn(app.get(AniListAdapter), 'fetchAnime').mockRejectedValueOnce(
            new Error('mapper bug'),
          );
        },
      ],
      [
        'AniList answers not found',
        () => {
          aniListExtra = [];
        },
      ],
      [
        'AniList answers HTTP 503',
        () => {
          anilist.up = false;
        },
      ],
      [
        'the source refuses on the retry after a 429',
        () => {
          vi.spyOn(app.get(AniListAdapter), 'fetchAnime').mockRejectedValueOnce(
            new SourceUnavailableError('anilist', COOLING_DOWN_REASON, true),
          );
        },
      ],
    ])(
      'keeps both tokens spent when a request was sent: %s',
      async (_, arrange) => {
        arrange();

        await expect(importer.importNew(missing(0), alice)).rejects.toThrow();
        expect(visitorTokensLeft(ALICE_IP)).toBe(4);
        expect(globalTokensLeft()).toBe(9);
      },
    );

    describe('over HTTP, with the internal key enforced', () => {
      let keyedApp: INestApplication<App>;
      let keyedImporter: AnimeImportService;
      let keyedLimits: ResettableImportLimits;

      const keyedGet = (path: string, clientIp?: string | string[]) => {
        const call = request(keyedApp.getHttpServer())
          .get(path)
          .set('X-Internal-Api-Key', FAKE_KEY);
        return clientIp === undefined
          ? call
          : call.set({ 'X-Client-Ip': clientIp });
      };
      const coldImport = (offset: number, clientIp?: string | string[]) =>
        keyedGet(`/anime/anilist/${MISSING_ID + offset}`, clientIp);

      beforeAll(async () => {
        keyedLimits = new ResettableImportLimits(clock);
        keyedApp = await createTestApp({
          clock,
          overrides: [
            { provide: AnimeSourceSettings, useValue: settings },
            { provide: ImportLimits, useValue: keyedLimits },
            {
              provide: InternalKeySettings,
              useValue: {
                get: () => ({ kind: 'enforced', acceptedKeys: [FAKE_KEY] }),
              },
            },
          ],
        });
        keyedImporter = keyedApp.get(AnimeImportService);
      });

      beforeEach(() => {
        keyedLimits.reset();
      });

      afterEach(async () => {
        await keyedImporter.settle();
      });

      afterAll(async () => {
        await keyedImporter.settle();
        await keyedApp.close();
      });

      it("answers a visitor's 6th cold import with 429 and a whole-second Retry-After", async () => {
        for (let offset = 0; offset < 5; offset += 1) {
          await coldImport(offset, ALICE_IP).expect(404);
        }

        const refused = await coldImport(5, ALICE_IP).expect(429);
        expect(refused.body).toEqual({
          error: {
            code: 'ANIME_IMPORT_VISITOR_LIMIT_REACHED',
            message:
              'You opened many new anime in a short time. Try again in a moment.',
          },
        });
        expect(refused.headers['retry-after']).toBe('40');

        clock.advance(39_001);
        const later = await coldImport(5, ALICE_IP).expect(429);
        expect(later.headers['retry-after']).toBe('1');
        await coldImport(6, '198.51.100.9').expect(404);
      });

      it('still serves a stored anime to a limited visitor, by id and by slug', async () => {
        await keyedGet('/anime/myanimelist/52991', '198.51.100.9').expect(200);
        await keyedImporter.settle();
        for (let offset = 0; offset < 5; offset += 1) {
          await coldImport(offset, ALICE_IP).expect(404);
        }
        await coldImport(5, ALICE_IP).expect(429);

        await keyedGet('/anime/myanimelist/52991', ALICE_IP).expect(200);
        await keyedGet(
          '/anime/slugs/frieren-beyond-journeys-end',
          ALICE_IP,
        ).expect(200);
      });

      it('puts calls without X-Client-Ip and with a list in it in one shared bucket', async () => {
        for (let offset = 0; offset < 3; offset += 1) {
          await coldImport(offset).expect(404);
        }
        await coldImport(3, '203.0.113.7, 198.51.100.9').expect(404);
        await coldImport(4, ['203.0.113.7', '198.51.100.9']).expect(404);

        const refused = await coldImport(5).expect(429);
        expect(refused.body).toMatchObject(visitorLimited);
      });

      it('puts two hosts of one IPv6 /64 in one bucket, and the next /64 in another', async () => {
        for (let offset = 0; offset < 3; offset += 1) {
          await coldImport(offset, '2001:db8:1:2::a').expect(404);
        }
        await coldImport(3, '2001:DB8:1:2:ffff::b').expect(404);
        await coldImport(4, '2001:0db8:0001:0002::c').expect(404);

        await coldImport(5, '2001:db8:1:2::d').expect(429);
        await coldImport(5, '2001:db8:1:3::a').expect(404);
      });

      it('puts an IPv4-mapped IPv6 in the bucket of the plain IPv4', async () => {
        for (let offset = 0; offset < 5; offset += 1) {
          await coldImport(offset, ALICE_IP).expect(404);
        }

        await coldImport(5, `::ffff:${ALICE_IP}`).expect(429);
      });
    });
  });
});
