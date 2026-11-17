import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
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
 * Rehashes a password after a successful sign-in when its stored cost is not ARGON2_PARAMS
 * (ADR 0015). The caller never awaits it, so the sign-in answer does not wait for a second
 * argon2 run. Only the hash changes, never the session epoch: no device is signed out.
 */
@Injectable()
export class PasswordRehasher {
  private readonly logger = new Logger(PasswordRehasher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Never rejects: AUTH_BUSY and database errors become one warning naming the user id only
   * (never the error, whose text can quote the query and its hashes); the next sign-in retries.
   */
  schedule(request: RehashRequest): Promise<void> {
    return this.rehash(request).catch((caught: unknown) => {
      const reason =
        caught instanceof ApiException && caught.error.code === 'AUTH_BUSY'
          ? 'hash cap reached'
          : 'hash or update failed';
      this.logger.warn(
        `Password rehash skipped for user ${request.userId} (${reason}); retried at the next sign-in.`,
      );
    });
  }

  private async rehash(request: RehashRequest): Promise<void> {
    if (!this.hasher.needsRehash(request.storedHash)) return;
    const passwordHash = await this.hasher.hash(request.password);
    // Compare-and-set: a password changed since the lookup wins, and this update is a no-op.
    await this.prisma.user.updateMany({
      where: { id: request.userId, passwordHash: request.storedHash },
      data: { passwordHash },
    });
  }
}
