import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type ClientIpKey, signInHits } from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthSecrets } from './auth-secrets';
import {
  identifierKind,
  type NormalisedIdentifier,
  normaliseIdentifier,
} from './credential-rules';
import { PasswordHasher } from './password-hasher';
import { PasswordRehasher } from './password-rehasher';
import { type IssuedSession, SessionService } from './session.service';

export interface SignInAttempt {
  /** As typed (bounded by SignInDto); normalised here before any key or lookup sees it. */
  readonly identifier: string;
  readonly password: string;
  readonly ip: ClientIpKey;
}

/** One failure for every wrong-credential case: unknown, unverified or wrong password (ADR 0015). */
export type SignInOutcome =
  | ({ readonly kind: 'signed_in' } & IssuedSession)
  | { readonly kind: 'invalid_credentials' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number };

const INVALID_CREDENTIALS: SignInOutcome = { kind: 'invalid_credentials' };

interface SignInAccount {
  readonly id: string;
  readonly passwordHash: string;
  readonly emailVerifiedAt: Date | null;
  readonly sessionEpoch: number;
}

/**
 * POST /auth/sign-in (ADR 0015). Order: the attempt is counted first (per IP, then (identifier,
 * IP), then identifier), before the lookup and before any hash, so a refused attempt costs one
 * upsert and no argon2. Every counted attempt then runs exactly one verification: the stored
 * hash of a verified account, the dummy one otherwise, so timing does not tell an unknown or
 * unverified account from a wrong password. Errors (database 503, AUTH_BUSY 429) propagate:
 * never a sign-in without a counted attempt and a matching hash. Logs nothing. On a success it
 * hands the matched password to `PasswordRehasher`, which rehashes only an outdated cost.
 */
@Injectable()
export class SignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: AuthRateLimiter,
    private readonly secrets: AuthSecrets,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly rehasher: PasswordRehasher,
  ) {}

  async signIn(attempt: SignInAttempt): Promise<SignInOutcome> {
    const identifier = normaliseIdentifier(attempt.identifier);
    const decision = await this.limiter.check(
      signInHits(this.secrets.hmacKey(), attempt.ip, identifier),
    );
    if (decision.kind === 'limited') {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
    const account = await this.findAccount(identifier);
    const verifiedAccount =
      account !== null && account.emailVerifiedAt !== null ? account : null;
    const check = await this.hasher.verify(
      attempt.password,
      verifiedAccount === null ? null : verifiedAccount.passwordHash,
    );
    // No counter is reset on success: a caller holding one valid password could otherwise sign
    // in between guesses at other accounts to clear its per-IP count.
    if (verifiedAccount === null || check !== 'match')
      return INVALID_CREDENTIALS;
    const session = await this.sessions.create({
      userId: verifiedAccount.id,
      sessionEpoch: verifiedAccount.sessionEpoch,
    });
    // Not awaited: the answer never waits for the rehash, which never rejects (slice 1c-iii).
    void this.rehasher.schedule({
      userId: verifiedAccount.id,
      password: attempt.password,
      storedHash: verifiedAccount.passwordHash,
    });
    return { kind: 'signed_in', ...session };
  }

  /** Sign-up stores `email` and `usernameKey` as normaliseIdentifier output, so one unique lookup. */
  private findAccount(
    identifier: NormalisedIdentifier,
  ): Promise<SignInAccount | null> {
    const where: Prisma.UserWhereUniqueInput =
      identifierKind(identifier) === 'email'
        ? { email: identifier }
        : { usernameKey: identifier };
    return this.prisma.user.findUnique({
      where,
      select: {
        id: true,
        passwordHash: true,
        emailVerifiedAt: true,
        sessionEpoch: true,
      },
    });
  }
}
