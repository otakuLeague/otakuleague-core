import type { INestApplication } from '@nestjs/common';
import request, { type Test } from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import {
  type InternalKeyCheck,
  InternalKeySettings,
} from '../common/internal-key.guard';
import { createTestApp } from '../testing/test-app';
import {
  SEARCH_VISITOR_BURST,
  SEARCH_VISITOR_REFILL_MS,
} from './search-limits';

/** Obvious fakes of a valid shape (64 characters). */
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '1');
const ENFORCED: InternalKeyCheck = {
  kind: 'enforced',
  acceptedKeys: [FAKE_KEY],
  previewKey: FAKE_PREVIEW_KEY,
};
const OPEN: InternalKeyCheck = { kind: 'open' };
const ALICE = '203.0.113.10';
const BOB = '203.0.113.11';

class MovableClock extends Clock {
  private instant = new Date('2026-11-15T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

describe('per-visitor limit on search (OTA-196)', () => {
  let app: INestApplication<App>;
  let clock: MovableClock;

  const boot = async (check: InternalKeyCheck) => {
    app = await createTestApp({
      clock,
      overrides: [
        { provide: InternalKeySettings, useValue: { get: () => check } },
      ],
    });
  };
  /** A search as a web caller (`ip` undefined: no X-Client-Ip header). */
  const search = (ip?: string, path = '/anime/search?q=aot'): Test => {
    const call = request(app.getHttpServer())
      .get(path)
      .set('X-Internal-Api-Key', FAKE_KEY);
    return ip === undefined ? call : call.set('X-Client-Ip', ip);
  };
  const drain = async (ip?: string) => {
    for (let taken = 0; taken < SEARCH_VISITOR_BURST; taken += 1) {
      await search(ip).expect(200);
    }
  };

  beforeEach(() => {
    clock = new MovableClock();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets 20 searches through and refuses the 21st with its own 429 and Retry-After', async () => {
    await boot(ENFORCED);
    await drain(ALICE);

    const refused = await search(ALICE).expect(429);

    expect(refused.headers['retry-after']).toBe('2');
    expect(refused.body).toEqual({
      error: {
        code: 'ANIME_SEARCH_VISITOR_LIMIT_REACHED',
        message:
          'You searched many times in a short time. Try again in a moment.',
      },
    });
  });

  it('answers again once one refill step has passed', async () => {
    await boot(ENFORCED);
    await drain(ALICE);
    await search(ALICE).expect(429);

    clock.advance(SEARCH_VISITOR_REFILL_MS);

    await search(ALICE).expect(200);
    await search(ALICE).expect(429);
  });

  it('leaves a second address unaffected', async () => {
    await boot(ENFORCED);
    await drain(ALICE);
    await search(ALICE).expect(429);

    await search(BOB).expect(200);
  });

  it('still answers 400 for an invalid request when the bucket is empty', async () => {
    await boot(ENFORCED);
    await drain(ALICE);

    await search(ALICE, '/anime/search').expect(400);
    await search(ALICE, '/anime/search?q=aot&page=0').expect(400);
  });

  it('charges nothing for invalid requests', async () => {
    await boot(ENFORCED);
    for (let bad = 0; bad < 5; bad += 1) {
      await search(ALICE, '/anime/search').expect(400);
    }

    await drain(ALICE);
    await search(ALICE).expect(429);
  });

  it('shares one unknown bucket between callers without X-Client-Ip', async () => {
    await boot(ENFORCED);
    await drain(undefined);

    await search(undefined).expect(429);
    await search('not-an-ip').expect(429);
    await search(ALICE).expect(200);
  });

  it('shares one preview bucket between preview callers', async () => {
    await boot(ENFORCED);
    const preview = (ip: string): Test =>
      request(app.getHttpServer())
        .get('/anime/search?q=aot')
        .set('X-Internal-Api-Key', FAKE_PREVIEW_KEY)
        .set('X-Client-Ip', ip);
    for (let taken = 0; taken < SEARCH_VISITOR_BURST; taken += 1) {
      await preview(ALICE).expect(200);
    }

    await preview(BOB).expect(429);
  });

  it('never limits an open caller', async () => {
    await boot(OPEN);
    for (let taken = 0; taken < SEARCH_VISITOR_BURST + 5; taken += 1) {
      await request(app.getHttpServer()).get('/anime/search?q=aot').expect(200);
    }
  });
});
