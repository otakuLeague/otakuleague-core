import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app';

describe('GET /health with the test database', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with the database up', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });
});
