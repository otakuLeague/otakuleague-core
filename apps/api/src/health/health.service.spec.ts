import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { DATABASE_CHECK_TIMEOUT_MS, HealthService } from './health.service';

function healthServiceWith(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({ $queryRaw: queryRaw } as unknown as PrismaService);
}

describe('HealthService.check', () => {
  let logWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logWarn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports the database up when SELECT 1 succeeds', async () => {
    const service = healthServiceWith(() =>
      Promise.resolve([{ '?column?': 1 }]),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('reports the database down when the query fails', async () => {
    const service = healthServiceWith(() =>
      Promise.reject(new Error("Can't reach database server at 127.0.0.1:1")),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
    expect(logWarn).toHaveBeenCalledWith(
      "Database check failed: Can't reach database server at 127.0.0.1:1",
    );
  });

  it('reports the database down when the query never answers', async () => {
    vi.useFakeTimers();
    const service = healthServiceWith(() => new Promise(() => undefined));

    const result = service.check();
    await vi.advanceTimersByTimeAsync(DATABASE_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });

  it('still reports up when the answer arrives just before the timeout', async () => {
    vi.useFakeTimers();
    const service = healthServiceWith(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, DATABASE_CHECK_TIMEOUT_MS - 1);
        }),
    );

    const result = service.check();
    await vi.advanceTimersByTimeAsync(DATABASE_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('clears its timer once the query has answered', async () => {
    vi.useFakeTimers();
    const service = healthServiceWith(() => Promise.resolve([]));

    await service.check();

    expect(vi.getTimerCount()).toBe(0);
  });
});
