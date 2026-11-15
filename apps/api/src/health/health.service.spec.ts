import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import {
  DATABASE_CHECK_TIMEOUT_MS,
  HealthService,
  sessionZoneOf,
} from './health.service';

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

  it('reports the database up when the session zone is UTC', async () => {
    const service = healthServiceWith(() => Promise.resolve([{ zone: 'UTC' }]));

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(logWarn).not.toHaveBeenCalled();
  });

  it.each(['Asia/Tokyo', 'Etc/UTC', 'utc'])(
    'reports the database down, and names the zone, when the session zone is %s',
    async (zone) => {
      const service = healthServiceWith(() => Promise.resolve([{ zone }]));

      await expect(service.check()).resolves.toEqual({
        status: 'error',
        checks: { database: 'down' },
      });
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(logWarn).toHaveBeenCalledWith(
        `Database session time zone is "${zone}", not UTC: the OTA-200 pin is not in effect`,
      );
    },
  );

  it.each([[[]], [[{}]], [[{ zone: 1 }]], [undefined]])(
    'reports the database down as unreadable when the answer is %j',
    async (rows) => {
      const service = healthServiceWith(() => Promise.resolve(rows));

      await expect(service.check()).resolves.toEqual({
        status: 'error',
        checks: { database: 'down' },
      });
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(logWarn).toHaveBeenCalledWith(
        'Database session time zone is unreadable, not UTC: the OTA-200 pin is not in effect',
      );
    },
  );

  it('cuts a long zone name to 64 characters in the log', async () => {
    const service = healthServiceWith(() =>
      Promise.resolve([{ zone: 'Z'.repeat(200) }]),
    );

    await service.check();

    expect(logWarn).toHaveBeenCalledWith(
      `Database session time zone is "${'Z'.repeat(64)}", not UTC: the OTA-200 pin is not in effect`,
    );
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
          setTimeout(() => {
            resolve([{ zone: 'UTC' }]);
          }, DATABASE_CHECK_TIMEOUT_MS - 1);
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
    const service = healthServiceWith(() => Promise.resolve([{ zone: 'UTC' }]));

    await service.check();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('sessionZoneOf', () => {
  it('reads the zone of the first row', () => {
    expect(sessionZoneOf([{ zone: 'UTC' }, { zone: 'Asia/Tokyo' }])).toBe(
      'UTC',
    );
  });

  it.each([[null], ['UTC'], [[null]], [[{ zone: null }]]])(
    'returns undefined for %j',
    (rows) => {
      expect(sessionZoneOf(rows)).toBeUndefined();
    },
  );
});
