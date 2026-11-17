import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock } from '../testing/test-app';
import {
  AUTH_CLEANUP_INTERVAL_MS,
  AuthCleanupAlerts,
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

class RecordingAlerts extends AuthCleanupAlerts {
  readonly failures: (readonly [string, string])[] = [];

  stepFailed(step: string, errorKind: string): void {
    this.failures.push([step, errorKind]);
  }
}

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
  const alerts = new RecordingAlerts();
  return {
    scheduler: new AuthCleanupScheduler(cleanup, alerts),
    alerts,
    calls,
    spies,
    log,
    warn,
  };
}

/** A step that runs until the test calls `finish`. */
function held() {
  let finish: (count: number) => void = () => undefined;
  const step = () =>
    new Promise<number>((resolve) => {
      finish = resolve;
    });
  return { step, finish: (count: number) => finish(count) };
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

  it('runs the other steps after a failing one; the warning and the alert hold its label and kind only', async () => {
    const failure = Object.assign(
      new Error('delete failed near token_hash = \\x00ff, id = fake-id'),
      { code: 'P1001' },
    );
    const { scheduler, alerts, calls, log, warn } = setup({
      removeExpiredSessions: () => Promise.reject(failure),
    });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    expect(calls).toEqual(STEPS);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup step failed: sessions (P1001)',
    );
    expect(alerts.failures).toEqual([['sessions', 'P1001']]);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup removed: rate limits 1, sessions failed, tokens 3, username holds 4, pending sign-ups 5',
    );
    await scheduler.onModuleDestroy();
  });

  it.each([
    ['an error class name', new TypeError('fake-id 00ff'), 'TypeError'],
    [
      'unknown for a name that is not an identifier',
      fakeNamed('id fake-id'),
      'unknown',
    ],
    [
      'the class name when the code is not a Prisma code',
      Object.assign(new Error('x'), { code: 'fake-id' }),
      'Error',
    ],
  ])('reports %s', async (_, failure, kind) => {
    const { scheduler, alerts } = setup({
      removeEndedRateLimits: () => Promise.reject(failure),
    });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    expect(alerts.failures).toEqual([['rate limits', kind]]);
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
    const first = held();
    const { scheduler, spies } = setup({ removeEndedRateLimits: first.step });
    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(AUTH_CLEANUP_INTERVAL_MS);
    expect(spies[0]).toHaveBeenCalledTimes(1);

    first.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(spies[4]).toHaveBeenCalledTimes(1);
    await scheduler.onModuleDestroy();
  });

  it('on shutdown skips the remaining steps of the running pass and waits for it', async () => {
    const first = held();
    const { scheduler, calls, log } = setup({
      removeEndedRateLimits: first.step,
    });
    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(FIRST_AUTH_CLEANUP_DELAY_MS);

    const destroyed = scheduler.onModuleDestroy();
    first.finish(7);
    await destroyed;

    expect(calls).toEqual(['removeEndedRateLimits']);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Auth cleanup removed: rate limits 7, sessions skipped, tokens skipped, username holds skipped, pending sign-ups skipped',
    );
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

function fakeNamed(name: string): Error {
  const error = new Error('fake');
  error.name = name;
  return error;
}
