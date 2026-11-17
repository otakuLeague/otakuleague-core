import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from './password-hasher';

export interface RehashRequest {
  readonly userId: string;
  /** The password that just matched `storedHash`. */
  readonly password: string;
  /** The PHC string read by the sign-in lookup: the compare-and-set only replaces this value. */
  readonly storedHash: string;
}

/**
 * Rehashes a password after a successful sign-in when its stored cost is weaker than
 * ARGON2_PARAMS (ADR 0015). The caller never awaits it, so the sign-in answer does not wait for
 * a second argon2 run. Optional work: it never queues for a hash slot (skipped when none is
 * free), runs at most once per user at a time, and changes only the hash, never the session
 * epoch, so no device is signed out. The next sign-in retries whatever was skipped or failed.
 */
@Injectable()
export class PasswordRehasher implements OnModuleDestroy {
  private readonly logger = new Logger(PasswordRehasher.name);
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  /** Never rejects; joins the rehash already running for this user. */
  schedule(request: RehashRequest): Promise<void> {
    const running = this.inFlight.get(request.userId);
    if (running !== undefined) return running;
    const rehash = this.rehash(request)
      .catch(() => {
        this.warnFailed(request.userId);
      })
      .finally(() => this.inFlight.delete(request.userId));
    this.inFlight.set(request.userId, rehash);
    return rehash;
  }

  /** Waits for every rehash in progress. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  /** Background work must not outlive the database connection. */
  async onModuleDestroy(): Promise<void> {
    await this.settle();
  }

  private async rehash(request: RehashRequest): Promise<void> {
    if (!this.hasher.needsRehash(request.storedHash)) return;
    const hashed = await this.hasher.tryHash(request.password);
    if (hashed.kind === 'skipped') return;
    // Compare-and-set: a password changed since the lookup wins, and this update is a no-op.
    await this.prisma.user.updateMany({
      where: { id: request.userId, passwordHash: request.storedHash },
      data: { passwordHash: hashed.value },
    });
  }

  /** The user id only, never the error: its text can quote the query and its hashes. */
  private warnFailed(userId: string): void {
    try {
      this.logger.warn(
        `Password rehash failed for user ${userId}; retried at the next sign-in.`,
      );
    } catch {
      // A failing logger must not become an unhandled rejection.
    }
  }
}
