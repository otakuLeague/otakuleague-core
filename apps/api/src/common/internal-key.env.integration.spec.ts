import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../testing/test-app';
import { INTERNAL_API_KEY_HEADER } from './internal-key.guard';

// AppModule reads the environment when it is imported, so the fake key goes in before any
// import. No InternalKeySettings override: this is the wiring production runs.
const { FAKE_KEY, previousKey } = vi.hoisted(() => {
  const previous = process.env.INTERNAL_API_KEY;
  const key = 'fake-internal-api-key-'.padEnd(64, '0');
  process.env.INTERNAL_API_KEY = key;
  return { FAKE_KEY: key, previousKey: previous };
});

describe('internal API key read from INTERNAL_API_KEY', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    // Assigning undefined would store the string "undefined".
    if (previousKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = previousKey;
  });

  it('refuses a caller without the key', async () => {
    const response = await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .expect(403);

    expect(response.body).toMatchObject({
      error: { code: 'INTERNAL_KEY_REQUIRED' },
    });
  });

  it('answers a caller with the key', async () => {
    await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .set(INTERNAL_API_KEY_HEADER, FAKE_KEY)
      .expect(200);
  });

  it('answers GET /health without the key', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
