import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { captureBackgroundStepFailure } from '../observability/sentry';
import { AuthCleanupService } from './auth-cleanup.service';

/** A minute after boot, so a process restarted more often than daily still cleans up. */
export const FIRST_AUTH_CLEANUP_DELAY_MS = 60 * 1000;
export const AUTH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Where a failed step is reported besides the log: Sentry in the app, a fake in tests. */
export abstract class AuthCleanupAlerts {
  abstract stepFailed(step: string, errorKind: string): void;
}

@Injectable()
export class SentryAuthCleanupAlerts extends AuthCleanupAlerts {
  stepFailed(step: string, errorKind: string): void {
    captureBackgroundStepFailure('Auth cleanup', step, errorKind);
  }
}

interface AuthCleanupStep {
  /** What the log line names: never a key, an id or a hash. */
  readonly label: string;
  readonly remove: (cleanup: AuthCleanupService) => Promise<number>;
}

/** In this order; one failing step never stops the next. */
const AUTH_CLEANUP_STEPS: readonly AuthCleanupStep[] = [
  { label: 'rate limits', remove: (c) => c.removeEndedRateLimits() },
  { label: 'sessions', remove: (c) => c.removeExpiredSessions() },
  { label: 'tokens', remove: (c) => c.removeExpiredTokens() },
  { label: 'username holds', remove: (c) => c.removeExpiredUsernameHolds() },
  {
    label: 'pending sign-ups',
    remove: (c) => c.removeExpiredPendingSignUps(),
  },
];

const PRISMA_ERROR_CODE = /^P\d{4}$/;
const ERROR_CLASS_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** A Prisma code (P1001) or an error class name: never a message, which can quote parameters. */
function errorKind(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    PRISMA_ERROR_CODE.test(error.code)
  ) {
    return error.code;
  }
  if (error instanceof Error && ERROR_CLASS_NAME.test(error.name)) {
    return error.name;
  }
  return 'unknown';
}

/**
 * Runs the auth cleanup a minute after boot, then daily (ADR 0015), like AnimePurgeScheduler:
 * an in-process timer, not a Railway cron. The timers never keep the process alive; a pass
 * still running joins the next start instead of doubling it. On shutdown the pass skips its
 * remaining steps and is awaited, so no delete outlives the database connection. A failing
 * step is one warning and one Sentry message with its label and error kind only, then one
 * line with the counts.
 */
@Injectable()
export class AuthCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly cleanup: AuthCleanupService,
    private readonly alerts: AuthCleanupAlerts,
  ) {}

  onModuleInit(): void {
    this.timers = [
      setTimeout(() => void this.run(), FIRST_AUTH_CLEANUP_DELAY_MS).unref(),
      setInterval(() => void this.run(), AUTH_CLEANUP_INTERVAL_MS).unref(),
    ];
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    await this.running;
  }

  /** One pass over every step; never rejects. */
  private run(): Promise<void> {
    this.running ??= this.cleanUp()
      // Every step catches its own error: only a failing logger can land here.
      .catch(() => undefined)
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async cleanUp(): Promise<void> {
    const results: string[] = [];
    for (const step of AUTH_CLEANUP_STEPS) {
      const result = this.stopped ? 'skipped' : await this.removeOrWarn(step);
      results.push(`${step.label} ${result}`);
    }
    this.logger.log(`Auth cleanup removed: ${results.join(', ')}`);
  }

  /** The number of rows removed, or `failed`. */
  private async removeOrWarn(step: AuthCleanupStep): Promise<string> {
    try {
      return String(await step.remove(this.cleanup));
    } catch (error: unknown) {
      const kind = errorKind(error);
      this.logger.warn(`Auth cleanup step failed: ${step.label} (${kind})`);
      this.alerts.stepFailed(step.label, kind);
      return 'failed';
    }
  }
}
