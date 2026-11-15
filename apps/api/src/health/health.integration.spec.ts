import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';

describe('GET /health with the test database', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with the database up and its session in UTC', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });
});

describe('GET /health when the session zone is not UTC', () => {
  let app: INestApplication<App>;
  let tokyoClient: PrismaClient;

  beforeAll(async () => {
    // Deliberately bypasses databasePoolConfig: it stands for a pooler that dropped the UTC pin.
    tokyoClient = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        options: '-c timezone=Asia/Tokyo',
      }),
    });
    app = await createTestApp({
      prisma: tokyoClient as unknown as PrismaService,
    });
  });

  afterAll(async () => {
    await app.close();
    await tokyoClient.$disconnect();
  });

  it('responds 503 with the database down', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
