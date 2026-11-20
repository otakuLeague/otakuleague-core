import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { RATE_LIMIT_LONGEST_WINDOW_MS } from './auth-rate-limit-rules';
import { SESSION_MAX_AGE_MS } from './session-rules';

const before = (now: Date, ms: number): Date => new Date(now.getTime() - ms);

/**
 * Deletes auth rows that can no longer be valid (ADR 0015 "Cleanup"). Each method is one
 * autocommit `deleteMany` and answers how many rows went. A row is removed exactly when the
 * rule that reads it already treats it as ended (`<= now`), so a row 1 ms inside its life
 * stays. `now` comes from Clock, never SQL `now()`. Errors propagate to the scheduler, which
 * logs the step only. Logs nothing: keys, ids and hashes never reach a log line.
 */
@Injectable()
export class AuthCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Counters whose window started a day ago or more: every rule's window has ended. */
  async removeEndedRateLimits(): Promise<number> {
    const cutoff = before(this.clock.now(), RATE_LIMIT_LONGEST_WINDOW_MS);
    const { count } = await this.prisma.authRateLimit.deleteMany({
      where: { windowStart: { lte: cutoff } },
    });
    return count;
  }

  /** Past their expiry or their 180-day hard stop, as `sessionValidity` decides. */
  async removeExpiredSessions(): Promise<number> {
    const now = this.clock.now();
    const { count } = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { createdAt: { lte: before(now, SESSION_MAX_AGE_MS) } },
        ],
      },
    });
    return count;
  }

  /** Expired tokens, used or not; a live one stays until its expiry, used or not. */
  async removeExpiredTokens(): Promise<number> {
    const { count } = await this.prisma.authToken.deleteMany({
      where: { expiresAt: { lte: this.clock.now() } },
    });
    return count;
  }

  async removeExpiredUsernameHolds(): Promise<number> {
    const { count } = await this.prisma.usernameHold.deleteMany({
      where: { expiresAt: { lte: this.clock.now() } },
    });
    return count;
  }

  /**
   * Unverified accounts past their `pendingExpiresAt`; their sessions and tokens go with them
   * (ON DELETE CASCADE). A null deadline (every account from before slice 1e) is never
   * deleted. Slice 1e sets the deadline to now + PENDING_SIGN_UP_TTL_MS in the same UPDATE
   * that re-arms an account on submit (resend never moves it), and clears it on
   * verification. Both are columns of the row this DELETE locks, and Postgres re-checks them
   * after waiting on that lock, so a re-submit or a verification racing the cleanup keeps the
   * account.
   */
  async removeExpiredPendingSignUps(): Promise<number> {
    const { count } = await this.prisma.user.deleteMany({
      where: {
        emailVerifiedAt: null,
        pendingExpiresAt: { lte: this.clock.now() },
      },
    });
    return count;
  }
}
