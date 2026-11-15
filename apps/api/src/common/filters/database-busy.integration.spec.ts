import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_POOL_MAX, PrismaService } from '../../prisma/prisma.service';
import { createTestApp } from '../../testing/test-app';
import { toErrorResponse } from './api-exception.filter';

const caught = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error('the database call was expected to fail');
    },
    (error: unknown) => error,
  );

// Pins the error shapes of the real driver (OTA-199): the filter matches on them.
describe('database busy errors answer 503', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({});
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps a statement cancelled by statement_timeout (57014)', async () => {
    const error = await caught(
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT set_config('statement_timeout', '50ms', true)`;
        await transaction.$queryRaw`SELECT pg_sleep(1)`;
      }),
    );

    expect(toErrorResponse(error).status).toBe(503);
  });

  it('maps a transaction that waited for a connection past maxWait', async () => {
    const holders = Array.from(
      { length: DATABASE_POOL_MAX },
      () => prisma.$queryRaw`SELECT pg_sleep(1.5)`,
    );

    const error = await caught(
      prisma.$transaction(() => Promise.resolve(), { maxWait: 200 }),
    );

    expect(toErrorResponse(error).status).toBe(503);
    await Promise.all(holders);
  });
});
