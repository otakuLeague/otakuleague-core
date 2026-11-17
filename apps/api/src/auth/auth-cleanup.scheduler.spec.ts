import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import {
  AUTH_CLEANUP_INTERVAL_MS,
  AuthCleanupScheduler,
  FIRST_AUTH_CLEANUP_DELAY_MS,
} from './auth-cleanup.scheduler';
import { AuthCleanupService } from './auth-cleanup.service';

// No database: every step is replaced. The real deletes: auth-cleanup.integration.spec.ts.
const STEPS = [
  'removeEndedRateLimits',
  'removeExpiredSessions',
  'removeExpiredTokens',
  'removeExpiredUsernameHolds',
  'removeExpiredPendingSignUps',
] as const;

type Step = (typeof STEPS)[number];

function setup(overrides: Partial<Record<Step, () => Promise<number>>> = {}) {
  const cleanup = new AuthCleanupService(
    {} as PrismaService,
    new FixedClock(new Date('2026-11-17T12:00:00.000Z')),
  );
  const calls: Step[] = [];
  const spies = STEPS.map((step, index) =>
    vi.spyOn(cleanup, step).mockImplementation(() => {
      calls.push(step);
      return overrides[step]?.() ?? Promise.resolve(index + 1);
    }),
  );
  const log = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  const warn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  return {
    scheduler: new AuthCleanupScheduler(cleanup),
    calls,
    spies,
    log,
    warn,
  };
}

describe('AuthCleanupScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs nothing in the first minute, every step in order at it, and again daily', async () => {
    const { scheduler, calls, log } = setup();
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS - 1);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(STEPS);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup removed: rate limits 1, sessions 2, tokens 3, username holds 4, pending sign-ups 5',
    );

    await vi.advanceTimersByTimeAsync(
      AUTH_CLEANUP_INTERVAL_MS - FIRST_AUTH_CLEANUP_DELAY_MS,
    );
    expect(calls).toEqual([...STEPS, ...STEPS]);
    await scheduler.onModuleDestroy();
  });

  it('runs the other steps after a failing one and warns with the step label only', async () => {
    const { scheduler, calls, log, warn } = setup({
      removeExpiredSessions: () =>
        Promise.reject(
          new Error('delete failed near token_hash = \\x00ff, id = fake-id'),
        ),
    });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    expect(calls).toEqual(STEPS);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup step failed: sessions',
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup removed: rate limits 1, sessions failed, tokens 3, username holds 4, pending sign-ups 5',
    );
    await scheduler.onModuleDestroy();
  });

  it('never rejects, even when the logger throws', async () => {
    const { scheduler, log } = setup();
    log.mockImplementation(() => {
      throw new Error('logger down');
    });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    expect(log).toHaveBeenCalledTimes(1);
    await expect(scheduler.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('joins a pass still running instead of starting a second one', async () => {
    let finish: (count: number) => void = () => undefined;
    const { scheduler, spies } = setup({
      removeEndedRateLimits: () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(AUTH_CLEANUP_INTERVAL_MS);
    expect(spies[0]).toHaveBeenCalledTimes(1);

    finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(spies[4]).toHaveBeenCalledTimes(1);
    await scheduler.onModuleDestroy();
  });

  it('waits for the running pass on shutdown', async () => {
    let finish: (count: number) => void = () => undefined;
    const { scheduler, log } = setup({
      removeEndedRateLimits: () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    });
    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    const destroyed = scheduler.onModuleDestroy();
    finish(0);
    await destroyed;

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('stops once destroyed, and destroying twice is harmless', async () => {
    const { scheduler, calls } = setup();
    scheduler.onModuleInit();
    await scheduler.onModuleDestroy();
    await scheduler.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(AUTH_CLEANUP_INTERVAL_MS * 3);
    expect(calls).toEqual([]);
  });

  it('does not keep the process alive', async () => {
    const { scheduler } = setup();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    scheduler.onModuleInit();

    const timers = [
      setTimeoutSpy.mock.results[0]?.value as NodeJS.Timeout,
      setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout,
    ];
    for (const timer of timers) expect(timer.hasRef()).toBe(false);
    await scheduler.onModuleDestroy();
  });
});
