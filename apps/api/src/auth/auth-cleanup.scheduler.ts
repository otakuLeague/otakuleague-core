import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AuthCleanupService } from './auth-cleanup.service';

/** A minute after boot, so a process restarted more often than daily still cleans up. */
export const FIRST_AUTH_CLEANUP_DELAY_MS = 60 * 1000;
export const AUTH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

/**
 * Runs the auth cleanup a minute after boot, then daily (ADR 0015), like AnimePurgeScheduler:
 * an in-process timer, not a Railway cron. The timers never keep the process alive; a pass
 * still running joins the next start instead of doubling it, and shutdown waits for it, so no
 * delete outlives the database connection. A failing step is one warning with its label only
 * (an error's text can quote the query and its parameters), then one line with the counts.
 */
@Injectable()
export class AuthCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(private readonly cleanup: AuthCleanupService) {}

  onModuleInit(): void {
    this.timers = [
      setTimeout(() => void this.run(), FIRST_AUTH_CLEANUP_DELAY_MS).unref(),
      setInterval(() => void this.run(), AUTH_CLEANUP_INTERVAL_MS).unref(),
    ];
  }

  async onModuleDestroy(): Promise<void> {
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
      results.push(`${step.label} ${await this.removeOrWarn(step)}`);
    }
    this.logger.log(`Auth cleanup removed: ${results.join(', ')}`);
  }

  /** The number of rows removed, or `failed`. */
  private async removeOrWarn(step: AuthCleanupStep): Promise<string> {
    try {
      return String(await step.remove(this.cleanup));
    } catch {
      this.logger.warn(`Auth cleanup step failed: ${step.label}`);
      return 'failed';
    }
  }
}
