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
  | { readonly kind: 'signed_out' };

const SIGNED_OUT: SessionResolution = { kind: 'signed_out' };

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
      },
    };
  }
}
