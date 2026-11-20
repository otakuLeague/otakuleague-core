import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ClientIpKey,
  confirmPasswordHits,
  perIpHits,
  type RateLimitDecision,
} from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthSecrets } from './auth-secrets';
import { normaliseIdentifier } from './credential-rules';
import { PasswordHasher } from './password-hasher';
import { type IssuedSession, SessionService } from './session.service';
import { bindingMatches, hashAuthToken } from './sign-up-rules';

export interface EmailVerificationAttempt {
  /** As sent (bounded by the DTO); only its SHA-256 is ever looked up. */
  readonly token: string;
  readonly bindingToken: string | undefined;
  readonly password: string | undefined;
  readonly ip: ClientIpKey;
}

export type EmailVerificationOutcome =
  | { readonly kind: 'verified'; readonly session: IssuedSession | null }
  | { readonly kind: 'already_verified' }
  | { readonly kind: 'confirmation_required' }
  | { readonly kind: 'token_invalid' }
  | { readonly kind: 'invalid_credentials' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number };

const ALREADY_VERIFIED = { kind: 'already_verified' } as const;
const TOKEN_INVALID = { kind: 'token_invalid' } as const;
const CONFIRMATION_REQUIRED: EmailVerificationOutcome = {
  kind: 'confirmation_required',
};
const INVALID_CREDENTIALS: EmailVerificationOutcome = {
  kind: 'invalid_credentials',
};

/** The token row with its user; liveness and "verified" come from SQL, no timestamp (OTA-200). */
interface TokenRow {
  readonly userId: string;
  readonly bindingHash: Uint8Array | null;
  readonly live: boolean;
  readonly verified: boolean;
  readonly email: string;
  readonly passwordHash: string;
}

/** What the request proved besides the token; the transaction states it in its own WHERE. */
type Proof =
  | { readonly kind: 'binding'; readonly bindingHash: Uint8Array }
  | { readonly kind: 'password'; readonly passwordHash: string };

type Verification =
  | { readonly kind: 'verified'; readonly sessionEpoch: number }
  | typeof ALREADY_VERIFIED
  | typeof TOKEN_INVALID;

/** Thrown inside the transaction so Prisma rolls back a consumed token; caught right outside. */
class TokenInvalidRollback extends Error {}

const limited = (
  decision: Extract<RateLimitDecision, { kind: 'limited' }>,
): EmailVerificationOutcome => ({
  kind: 'rate_limited',
  retryAfterSeconds: decision.retryAfterSeconds,
});

/**
 * POST /auth/email-verification/confirm (ADR 0020 Addendum 1e-ii). Order: count the IP; read the
 * token row by its SHA-256; unknown is 400, a verified user `already_verified`, a used or expired
 * token 400. A matching binding verifies and gets a session. Otherwise the pending password is
 * the proof (the pre-hijack gate): none sent is `confirmation_required`; one sent costs the
 * account's password counter, then exactly one argon2 verification outside any transaction;
 * wrong is 401 and consumes nothing. One transaction (user, then token: the cleanup's order)
 * consumes the token and verifies the user, each statement re-checking the proof. No dummy hash:
 * the status already tells a found token from an unknown one. Errors (database 503, AUTH_BUSY)
 * propagate, never a verification. Logs nothing.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: AuthRateLimiter,
    private readonly secrets: AuthSecrets,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async confirm(
    attempt: EmailVerificationAttempt,
  ): Promise<EmailVerificationOutcome> {
    const perIp = await this.limiter.check(
      perIpHits(
        this.secrets.hmacKey(),
        'email-verification-confirm',
        attempt.ip,
      ),
    );
    if (perIp.kind === 'limited') return limited(perIp);
    // One instant per request: the read and the transaction judge the same expiry.
    const now = this.clock.now().toISOString();
    const tokenHash = hashAuthToken(attempt.token);
    const row = await this.findToken(tokenHash, now);
    if (row === undefined) return TOKEN_INVALID;
    if (row.verified) return ALREADY_VERIFIED;
    if (!row.live) return TOKEN_INVALID;
    const { bindingToken, password } = attempt;
    const storedBinding = row.bindingHash;
    if (storedBinding !== null && bindingMatches(bindingToken, storedBinding)) {
      // Equal to the presented digest (just compared): step 2 requires it still on the token.
      const verification = await this.verify(row.userId, tokenHash, now, {
        kind: 'binding',
        bindingHash: storedBinding,
      });
      if (verification.kind !== 'verified') return verification;
      // After commit: if this insert fails, the member is verified and signs in (ADR 0020).
      const session = await this.sessions.create({
        userId: row.userId,
        sessionEpoch: verification.sessionEpoch,
      });
      return { kind: 'verified', session };
    }
    if (password === undefined) return CONFIRMATION_REQUIRED;
    // On purpose, expiry stays judged at `now`, the request's start (one Clock.now() per
    // request): a token live when the request began may be consumed after a slow hash.
    const budget = await this.limiter.check(
      confirmPasswordHits(
        this.secrets.hmacKey(),
        normaliseIdentifier(row.email),
      ),
    );
    if (budget.kind === 'limited') return limited(budget);
    const check = await this.hasher.verify(password, row.passwordHash);
    if (check !== 'match') return INVALID_CREDENTIALS;
    const verification = await this.verify(row.userId, tokenHash, now, {
      kind: 'password',
      passwordHash: row.passwordHash,
    });
    // ADR 0015: only the binding gives a session; this member signs in next.
    return verification.kind === 'verified'
      ? { kind: 'verified', session: null }
      : verification;
  }

  private async findToken(
    tokenHash: Uint8Array<ArrayBuffer>,
    now: string,
  ): Promise<TokenRow | undefined> {
    const [row] = await this.prisma.$queryRaw<TokenRow[]>`
      SELECT t.user_id::text AS "userId", t.binding_hash AS "bindingHash",
        (t.used_at IS NULL AND t.expires_at > ${now}::timestamptz) AS live,
        (u.email_verified_at IS NOT NULL) AS verified, u.email,
        u.password_hash AS "passwordHash"
      FROM auth_token t JOIN app_user u ON u.id = t.user_id
      WHERE t.token_hash = ${tokenHash}
        AND t.purpose = 'EMAIL_VERIFICATION'::auth_token_purpose`;
    return row;
  }

  /**
   * Three statements on primary keys, READ COMMITTED: lock the user (a racing confirm waits here
   * and then reads it verified), consume the token if it is still live, still this user's and,
   * on the binding path, still bound to that binding; then verify the user only if still
   * unverified and, on the password path, still holding the hash the password matched (C1: a
   * re-submit in between changes it). Either update finding nothing rolls back: 400.
   */
  private async verify(
    userId: string,
    tokenHash: Uint8Array<ArrayBuffer>,
    now: string,
    proof: Proof,
  ): Promise<Verification> {
    try {
      return await this.prisma.$transaction(
        async (tx): Promise<Verification> => {
          const [user] = await tx.$queryRaw<{ verified: boolean }[]>`
            SELECT email_verified_at IS NOT NULL AS verified FROM app_user
            WHERE id = ${userId}::uuid FOR UPDATE`;
          if (user === undefined) return TOKEN_INVALID;
          if (user.verified) return ALREADY_VERIFIED;
          const consumed = await tx.$executeRaw`
            UPDATE auth_token SET used_at = ${now}::timestamptz
            WHERE token_hash = ${tokenHash} AND user_id = ${userId}::uuid
              AND purpose = 'EMAIL_VERIFICATION'::auth_token_purpose
              AND used_at IS NULL AND expires_at > ${now}::timestamptz
              ${proof.kind === 'binding' ? Prisma.sql`AND binding_hash = ${proof.bindingHash}` : Prisma.empty}`;
          if (consumed !== 1) throw new TokenInvalidRollback();
          const [verified] = await tx.$queryRaw<{ sessionEpoch: number }[]>`
            UPDATE app_user SET email_verified_at = ${now}::timestamptz,
              pending_expires_at = NULL, updated_at = ${now}::timestamptz
            WHERE id = ${userId}::uuid AND email_verified_at IS NULL
              ${proof.kind === 'password' ? Prisma.sql`AND password_hash = ${proof.passwordHash}` : Prisma.empty}
            RETURNING session_epoch AS "sessionEpoch"`;
          if (verified === undefined) throw new TokenInvalidRollback();
          return { kind: 'verified', sessionEpoch: verified.sessionEpoch };
        },
        // Explicit: the design relies on READ COMMITTED re-reading the user after the lock wait.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (error instanceof TokenInvalidRollback) return TOKEN_INVALID;
      throw error;
    }
  }
}
