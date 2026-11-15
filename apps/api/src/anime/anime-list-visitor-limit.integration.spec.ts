import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request, { type Test } from 'supertest';
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
import {
  type InternalKeyCheck,
  InternalKeySettings,
} from '../common/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { AnimeListService } from './anime-list.service';
import {
  LIST_FETCH_REFILL_MS,
  LIST_VISITOR_BURST,
  LIST_VISITOR_REFILL_MS,
} from './list-fetch-limits';
import { AniListAdapter } from './sources/anilist.adapter';
import { AnimeSourceSettings } from './sources/source-settings';
import { SourceUnavailableError } from './sources/source.types';

const HOUR_MS = 3_600_000;
/** Obvious fakes of a valid shape (64 characters). */
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '1');
const ENFORCED: InternalKeyCheck = {
  kind: 'enforced',
  acceptedKeys: [FAKE_KEY],
  previewKey: FAKE_PREVIEW_KEY,
};
const ALICE = '203.0.113.10';
const BOB = '203.0.113.11';
/** One distinct cold list per index: the genre filter makes a new cache key. */
const GENRES = ['Action', 'Comedy', 'Drama', 'Ecchi', 'Horror', 'Music'];

class MovableClock extends Clock {
  private instant = new Date('2026-11-12T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

describe('per-visitor limit on cold list fetches (OTA-189)', () => {
  let app: INestApplication<App>;
  let lists: AnimeListService;
  let clock: MovableClock;
  let server: Server;
  let requests: number;
  /** While set, the fake AniList waits for it before answering. */
  let gate: Promise<void> | null;
  let settings: AnimeSourceSettings;

  const boot = async (check: InternalKeyCheck) => {
    app = await createTestApp({
      clock,
      overrides: [
        { provide: AnimeSourceSettings, useValue: settings },
        { provide: InternalKeySettings, useValue: { get: () => check } },
      ],
    });
    lists = app.get(AnimeListService);
    await truncateAllTables(app.get(PrismaService));
  };
  /** A cold list read as a web caller (`ip` undefined: no X-Client-Ip header). */
  const cold = (
    index: number,
    ip?: string,
    path = `/anime/lists/top?genre=${GENRES[index]}`,
  ): Test => {
    const call = request(app.getHttpServer())
      .get(path)
      .set('X-Internal-Api-Key', FAKE_KEY);
    return ip === undefined ? call : call.set('X-Client-Ip', ip);
  };
  const previewCold = (index: number, ip: string): Test =>
    request(app.getHttpServer())
      .get(`/anime/lists/top?genre=${GENRES[index]}`)
      .set('X-Internal-Api-Key', FAKE_PREVIEW_KEY)
      .set('X-Client-Ip', ip);
  const burst = async (ip: string | undefined, from = 0) => {
    for (let index = from; index < from + LIST_VISITOR_BURST; index += 1) {
      await cold(index, ip).expect(200);
    }
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        requests += 1;
        void (gate ?? Promise.resolve()).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({
              data: {
                Page: {
                  pageInfo: { hasNextPage: false },
                  media: [
                    {
                      id: 7000 + requests,
                      isAdult: false,
                      title: { romaji: `Synthetic ${requests}`, english: null },
                      coverImage: { large: null, color: null },
                      format: 'TV',
                      status: 'RELEASING',
                      genres: [],
                      popularity: 10,
                      averageScore: 70,
                    },
                  ],
                },
              },
            }),
          );
        });
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    settings = {
      get: () => ({
        enabled: true,
        baseUrl: url,
        minIntervalMs: 0,
        timeoutMs: 2_000,
        maxRetryAfterMs: 1_000,
        coolDownMs: 0,
        maxQueueMs: 5_000,
      }),
    };
  });

  beforeEach(() => {
    requests = 0;
    gate = null;
    clock = new MovableClock();
  });

  afterEach(async () => {
    await lists.settle();
    await app.close();
  });

  afterAll(() => {
    server.close();
  });

  it("refuses a visitor's 4th cold page with its own 429 and Retry-After, and leaves others alone", async () => {
    await boot(ENFORCED);
    await burst(ALICE);

    const refused = await cold(3, ALICE).expect(429);

    expect(refused.body).toEqual({
      error: {
        code: 'ANIME_LIST_VISITOR_LIMIT_REACHED',
        message:
          'You loaded many new lists in a short time. Try again in a moment.',
      },
    });
    expect(refused.headers['retry-after']).toBe('20');
    await cold(3, BOB).expect(200);
    expect(requests).toBe(LIST_VISITOR_BURST + 1);
  });

  it('keeps serving a stored page to a visitor whose bucket is empty', async () => {
    await boot(ENFORCED);
    await burst(ALICE);

    await cold(0, ALICE).expect(200);
    await cold(1, ALICE).expect(200);

    expect(requests).toBe(LIST_VISITOR_BURST);
  });

  it('gives the visitor one more cold page after a refill step', async () => {
    await boot(ENFORCED);
    await burst(ALICE);
    await cold(3, ALICE).expect(429);

    clock.advance(LIST_VISITOR_REFILL_MS);

    await cold(3, ALICE).expect(200);
    await cold(4, ALICE).expect(429);
  });

  it('charges nothing for joining a fetch that is already running', async () => {
    await boot(ENFORCED);
    await cold(0, ALICE).expect(200);
    await cold(1, ALICE).expect(200);
    let release: () => void = () => undefined;
    gate = new Promise<void>((resolve) => (release = resolve));
    const first = Promise.resolve(cold(2, ALICE));
    await vi.waitFor(() => expect(requests).toBe(3));

    const joined = Promise.resolve(cold(2, ALICE));
    release();

    expect((await first).status).toBe(200);
    expect((await joined).status).toBe(200);
    expect(requests).toBe(3);
  });

  it('gives the visitor token back when the fetch was refused before any request', async () => {
    await boot(ENFORCED);
    const refusing = vi
      .spyOn(app.get(AniListAdapter), 'fetchList')
      .mockRejectedValue(new SourceUnavailableError('anilist', 'queue full'));
    for (let index = 0; index <= LIST_VISITOR_BURST; index += 1) {
      await cold(index, ALICE).expect(503);
    }
    refusing.mockRestore();

    await burst(ALICE, 0);
  });

  it('refuses with the global code and returns the visitor token when the global bucket is empty', async () => {
    await boot(ENFORCED);
    await burst(ALICE, 0);
    await burst(BOB, 3);

    for (let attempt = 0; attempt <= LIST_VISITOR_BURST; attempt += 1) {
      const refused = await cold(
        0,
        '203.0.113.12',
        '/anime/lists/top?genre=Mecha',
      );
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({
        error: { code: 'ANIME_LIST_FETCH_LIMIT_REACHED' },
      });
      expect(refused.headers['retry-after']).toBe(
        String(LIST_FETCH_REFILL_MS / 1000),
      );
    }
  });

  it('serves a stale page and sends no request when the visitor has no token', async () => {
    await boot(ENFORCED);
    await app.get(PrismaService).animeListPage.create({
      data: {
        listKey: 'trending',
        page: 1,
        fetchedAt: new Date(clock.now().getTime() - 2 * HOUR_MS),
        hasNextPage: false,
        entries: [],
      },
    });
    await burst(ALICE);

    const stale = await cold(0, ALICE, '/anime/lists/trending').expect(200);
    await lists.settle();

    expect(stale.body).toMatchObject({ freshness: 'stale' });
    expect(requests).toBe(LIST_VISITOR_BURST);
  });

  it('puts no visitor limit on an open API, only the global one', async () => {
    await boot({ kind: 'open' });

    for (let index = 0; index < GENRES.length; index += 1) {
      await request(app.getHttpServer())
        .get(`/anime/lists/top?genre=${GENRES[index]}`)
        .expect(200);
    }

    expect(requests).toBe(GENRES.length);
  });

  it('makes every preview caller share one bucket, whatever X-Client-Ip says', async () => {
    await boot(ENFORCED);
    await previewCold(0, ALICE).expect(200);
    await previewCold(1, BOB).expect(200);
    await previewCold(2, '198.51.100.1').expect(200);

    const refused = await previewCold(3, '198.51.100.2').expect(429);

    expect(refused.body).toMatchObject({
      error: { code: 'ANIME_LIST_VISITOR_LIMIT_REACHED' },
    });
    await cold(3, ALICE).expect(200);
  });

  it('makes web calls without a usable client IP share the unknown bucket', async () => {
    await boot(ENFORCED);
    await cold(0).expect(200);
    await cold(1, 'not-an-ip').expect(200);
    await cold(2, `${ALICE},${BOB}`).expect(200);

    await cold(3).expect(429);
    await cold(3, ALICE).expect(200);
  });
});
