import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { hashSessionToken, sessionValidity } from './session-rules';

/** The member a request acts as: built from the session row only, never from the request. */
export interface SignedInSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly username: string;
}

export type SessionResolution =
  | { readonly kind: 'signed_in'; readonly session: SignedInSession }
  | {
      readonly kind: 'signed_out';
      readonly reason: 'unknown' | 'expired' | 'revoked';
    };

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
  ) {}

  /**
   * One lookup by the token's digest (unique index) joined to its user, then at most one
   * conditional write when renewal is due. Database errors propagate (503), never a sign-out.
   * Nothing here logs: the token and its digest never reach a log line.
   */
  async resolve(token: string): Promise<SessionResolution> {
    const [row] = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT s.id, s.session_epoch AS "sessionEpoch", s.created_at AS "createdAt",
        s.expires_at AS "expiresAt", u.id AS "userId", u.username,
        u.session_epoch AS "userSessionEpoch"
      FROM auth_session s JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = ${Buffer.from(hashSessionToken(token))}`;
    if (row === undefined) return { kind: 'signed_out', reason: 'unknown' };
    const validity = sessionValidity(
      row,
      { sessionEpoch: row.userSessionEpoch },
      this.clock.now(),
    );
    if (validity.kind !== 'valid') {
      return { kind: 'signed_out', reason: validity.kind };
    }
    if (validity.renewTo !== null) {
      // Only ever forward: two requests racing write once. Renewal never restores a session the
      // epoch check refuses, and a deleted row updates nothing.
      await this.prisma.session.updateMany({
        where: { id: row.id, expiresAt: { lt: validity.renewTo } },
        data: { expiresAt: validity.renewTo },
      });
    }
    return {
      kind: 'signed_in',
      session: {
        sessionId: row.id,
        userId: row.userId,
        username: row.username,
      },
    };
  }
}
