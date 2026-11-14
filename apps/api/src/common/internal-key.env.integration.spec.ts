import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../testing/test-app';
import { INTERNAL_API_KEY_HEADER } from './internal-key.guard';

// AppModule reads the environment when it is imported, so the fake keys go in before any
// import. No InternalKeySettings override: this is the wiring production runs.
const { FAKE_KEY, FAKE_PREVIEW_KEY, previousValues } = vi.hoisted(() => {
  const keys = {
    INTERNAL_API_KEY: 'fake-internal-api-key-'.padEnd(64, '0'),
    INTERNAL_API_KEY_PREVIEW: 'fake-preview-api-key-'.padEnd(64, '0'),
  };
  const previous = Object.entries(keys).map(
    ([name]) => [name, process.env[name]] as const,
  );
  Object.assign(process.env, keys);
  return {
    FAKE_KEY: keys.INTERNAL_API_KEY,
    FAKE_PREVIEW_KEY: keys.INTERNAL_API_KEY_PREVIEW,
    previousValues: previous,
  };
});

describe('internal API key read from INTERNAL_API_KEY', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    for (const [name, value] of previousValues) {
      // Assigning undefined would store the string "undefined".
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  });

  it('refuses a caller without the key', async () => {
    const response = await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .expect(403);

    expect(response.body).toMatchObject({
      error: { code: 'INTERNAL_KEY_REQUIRED' },
    });
  });

  it.each([
    ['the key', FAKE_KEY],
    ['the preview key from INTERNAL_API_KEY_PREVIEW', FAKE_PREVIEW_KEY],
  ])('answers a caller with %s', async (_, key) => {
    await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .set(INTERNAL_API_KEY_HEADER, key)
      .expect(200);
  });

  it('answers GET /health without the key', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
