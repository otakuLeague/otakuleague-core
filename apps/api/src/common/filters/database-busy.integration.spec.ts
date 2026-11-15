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
        await transaction.$queryRaw`SELECT pg_sleep(1)::text`;
      }),
    );

    expect(toErrorResponse(error).status).toBe(503);
  });

  it('maps a transaction that waited for a connection past maxWait', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let started = 0;
    let allStarted!: () => void;
    const everyConnectionHeld = new Promise<void>((resolve) => {
      allStarted = resolve;
    });
    const holders = Array.from({ length: DATABASE_POOL_MAX }, () =>
      prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT 1`;
          started += 1;
          if (started === DATABASE_POOL_MAX) allStarted();
          await gate;
        },
        { timeout: 10_000 },
      ),
    );
    await everyConnectionHeld;

    const error = await caught(
      prisma.$transaction(() => Promise.resolve(), { maxWait: 200 }),
    );
    open();
    await Promise.all(holders);

    expect(toErrorResponse(error).status).toBe(503);
  });
});
