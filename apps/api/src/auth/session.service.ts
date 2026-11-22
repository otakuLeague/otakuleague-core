import { Injectable } from '@nestjs/common';
import { Clock, Random } from '../common/clock-and-random.module';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  hashSessionToken,
  SESSION_IDLE_MS,
  SESSION_TOKEN_BYTES,
  sessionValidity,
} from './session-rules';

/** The member a request acts as: built from the session row only, never from the request. */
export interface SignedInSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly username: string;
  /** The user's epoch this session was resolved with: sign out everywhere raises only from it. */
  readonly sessionEpoch: number;
}

export type SessionResolution =
  | { readonly kind: 'signed_in'; readonly session: SignedInSession }
  | { readonly kind: 'signed_out' };

const SIGNED_OUT: SessionResolution = { kind: 'signed_out' };

/** A new session as the client gets it: the token exists only here and in the member's cookie. */
export interface IssuedSession {
  readonly sessionToken: string;
  readonly expiresAt: Date;
}

/** Whom a new session belongs to, and the user epoch read in the same lookup as the password. */
export interface SessionOwner {
  readonly userId: string;
  readonly sessionEpoch: number;
}

interface SessionRow {
  readonly id: string;
  readonly sessionEpoch: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly userId: string;
  readonly username: string;
  readonly userSessionEpoch: number;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  /**
   * A fresh token from Random (never from the client: no fixation), stored only as its SHA-256.
   * The epoch is the one read with the password hash, so a password reset racing this sign-in
   * leaves a session that is already revoked (ADR 0015). Logs nothing.
   */
  async create(owner: SessionOwner): Promise<IssuedSession> {
    const sessionToken = this.random
      .bytes(SESSION_TOKEN_BYTES)
      .toString('base64url');
    const createdAt = this.clock.now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_IDLE_MS);
    await this.prisma.session.create({
      data: {
        id: this.random.uuid(),
        tokenHash: hashSessionToken(sessionToken),
        userId: owner.userId,
        sessionEpoch: owner.sessionEpoch,
        createdAt,
        expiresAt,
      },
    });
    return { sessionToken, expiresAt };
  }

  /** Sign-out: the row goes, so the next request with the token is refused (0 s, ADR 0015). */
  async delete(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /**
   * Sign out everywhere from one session (ADR 0015 Addendum OTA-205): raises the epoch only from
   * the value that session was resolved with, so a replay or a parallel call that resolved the
   * same epoch changes nothing and still succeeds (every session of that epoch is already ended).
   */
  async signOutEverywhere(
    userId: string,
    expectedEpoch: number,
  ): Promise<void> {
    await this.raiseEpochAndDeleteSessions(
      this.prisma,
      userId,
      Prisma.sql`AND session_epoch = ${expectedEpoch}`,
    );
  }

  /**
   * Ends every session of a user inside the caller's transaction (OTA-140's password reset), so
   * `session_epoch` keeps one writer. READ COMMITTED only: a stricter level turns a concurrent
   * raise into a serialization failure instead of waiting on the row lock.
   */
  async revokeAll(userId: string, tx: Prisma.TransactionClient): Promise<void> {
    await this.raiseEpochAndDeleteSessions(tx, userId, Prisma.empty);
  }

  /**
   * One data-modifying CTE: raise the user's epoch (`updated_at` from Clock), then delete that
   * user's sessions. The DELETE only sees a user the UPDATE returned, so the user row is locked
   * first, then the sessions (the cleanup's order), and nothing is deleted when the UPDATE matched
   * no row. A sign-in racing it either read the old epoch (its session is refused throughout and
   * its row goes at its expiry) or the new one (valid). Database errors propagate (503). Logs
   * nothing.
   */
  private async raiseEpochAndDeleteSessions(
    db: Prisma.TransactionClient,
    userId: string,
    epochCondition: Prisma.Sql,
  ): Promise<void> {
    const now = this.clock.now().toISOString();
    await db.$executeRaw`
      WITH raised AS (
        UPDATE app_user SET session_epoch = session_epoch + 1,
          updated_at = ${now}::timestamptz
        WHERE id = ${userId}::uuid ${epochCondition}
        RETURNING id
      )
      DELETE FROM auth_session WHERE user_id IN (SELECT id FROM raised)`;
  }

  /**
   * One lookup by the token's digest (unique index) joined to its user, verified users only
   * (hard verification, ADR 0015, checked again here), then at most one conditional write when
   * renewal is due. Database errors propagate (503), never a sign-out. Nothing here logs: the
   * token and its digest never reach a log line.
   */
  async resolve(token: string): Promise<SessionResolution> {
    const [row] = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT s.id, s.session_epoch AS "sessionEpoch", s.created_at AS "createdAt",
        s.expires_at AS "expiresAt", u.id AS "userId", u.username,
        u.session_epoch AS "userSessionEpoch"
      FROM auth_session s JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = ${hashSessionToken(token)}
        AND u.email_verified_at IS NOT NULL`;
    if (row === undefined) return SIGNED_OUT;
    const validity = sessionValidity(
      row,
      { sessionEpoch: row.userSessionEpoch },
      this.clock.now(),
    );
    if (validity.kind !== 'valid') return SIGNED_OUT;
    if (validity.renewTo !== null) {
      // Compare-and-set on what was just read: a concurrent renewal, a later shortening (sign
      // out) or a raised user epoch makes it update nothing, so renewal never revives a session.
      await this.prisma.session.updateMany({
        where: {
          id: row.id,
          expiresAt: row.expiresAt,
          user: { sessionEpoch: row.userSessionEpoch },
        },
        data: { expiresAt: validity.renewTo },
      });
    }
    return {
      kind: 'signed_in',
      session: {
        sessionId: row.id,
        userId: row.userId,
        username: row.username,
        sessionEpoch: row.userSessionEpoch,
      },
    };
  }
}
