import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Clock, Random } from '../common/clock-and-random.module';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type ClientIpKey, perIpHits } from './auth-rate-limit-rules';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthSecrets } from './auth-secrets';
import {
  type NormalisedIdentifier,
  normaliseIdentifier,
} from './credential-rules';
import { type AuthEmail, EmailSender } from './email-sender';
import { PasswordHasher } from './password-hasher';
import { isReservedUsername } from './reserved-usernames';
import {
  AUTH_TOKEN_BYTES,
  hashAuthToken,
  PENDING_SIGN_UP_TTL_MS,
} from './sign-up-rules';

export interface SignUpAttempt {
  /** Checked by SignUpDto (USERNAME_PATTERN); stored as typed. */
  readonly username: string;
  /** As typed; SignUpDto checked its normalised shape, normalised here before any write. */
  readonly email: string;
  readonly password: string;
  readonly ip: ClientIpKey;
}

/** One `accepted` for a new, a pending and a registered email (ADR 0020 N1). */
export type SignUpOutcome =
  | { readonly kind: 'accepted'; readonly bindingToken: string }
  | { readonly kind: 'username_taken' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'closed' };

export interface ResendVerificationAttempt {
  /** As typed; EmailVerificationResendDto checked its normalised shape, normalised here before the read. */
  readonly email: string;
  readonly ip: ClientIpKey;
}

/**
 * One `accepted` for an unknown, a verified, a stale, a deadline-less and a pending address
 * (ADR 0020 Addendum 1e-ii-b, R1): the caller cannot tell whether a mail left.
 */
export type ResendVerificationOutcome =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'closed' };

export interface UsernameAvailabilityCheck {
  /** Checked by UsernameAvailabilityQueryDto (USERNAME_PATTERN, sign-up's rule). */
  readonly username: string;
  readonly ip: ClientIpKey;
}

/** `taken` for a taken and a held name alike (ADR 0020 Addendum 1e-iii). */
export type UsernameAvailabilityOutcome =
  | { readonly kind: 'available' }
  | { readonly kind: 'taken' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number };

const AVAILABLE = { kind: 'available' } as const;
const TAKEN = { kind: 'taken' } as const;
const USERNAME_TAKEN = { kind: 'username_taken' } as const;
const CLOSED = { kind: 'closed' } as const;
const RESEND_ACCEPTED = { kind: 'accepted' } as const;

/** The pending account a resend found and locked: where the new token is mailed. */
interface PendingAccount {
  readonly userId: string;
  /** As stored, for the mail. */
  readonly username: string;
}

/** What the transaction did: a pending account to verify, a registered one left untouched, or nothing. */
type Registration =
  | { readonly kind: 'pending'; readonly userId: string }
  | { readonly kind: 'registered' }
  | typeof USERNAME_TAKEN;

/** Every value one submit writes, drawn before the transaction; times as ISO strings (OTA-200). */
interface SignUpRecord {
  readonly newUserId: string;
  readonly username: string;
  readonly usernameKey: NormalisedIdentifier;
  readonly email: NormalisedIdentifier;
  readonly passwordHash: string;
  readonly tokenHash: Uint8Array<ArrayBuffer>;
  readonly bindingHash: Uint8Array<ArrayBuffer>;
  readonly now: string;
  readonly expiresAt: string;
}

/** Thrown inside the transaction so Prisma rolls back the hold it claimed; caught right outside. */
class UsernameTakenRollback extends Error {}

/** The cleanup's own predicate (removeExpiredPendingSignUps): unverified and past its deadline. */
const stale = (now: string): Prisma.Sql =>
  Prisma.sql`email_verified_at IS NULL AND pending_expires_at <= ${now}::timestamptz`;

/**
 * A unique violation on `username_key`, as the pg adapter reports it: P2002, or P2010 for raw SQL
 * with the adapter's cause naming the column or the index. The hold lock should make it
 * impossible; should it happen anyway, the answer is the 409 it means, never a 500.
 */
export function isUsernameKeyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapterError: unknown = error.meta?.driverAdapterError;
  const cause: unknown =
    typeof adapterError === 'object' && adapterError !== null
      ? Reflect.get(adapterError, 'cause')
      : undefined;
  const field = (name: string): unknown =>
    typeof cause === 'object' && cause !== null
      ? Reflect.get(cause, name)
      : undefined;
  const unique =
    error.code === 'P2002' ||
    (error.code === 'P2010' &&
      (field('kind') === 'UniqueConstraintViolation' ||
        field('originalCode') === '23505'));
  const named = JSON.stringify([
    error.meta?.target,
    field('constraint'),
    field('originalMessage'),
  ]).includes('username_key');
  return unique && named;
}

/**
 * POST /auth/sign-up (ADR 0020). Order: no sender is 403 SIGN_UP_CLOSED before anything; the attempt is counted
 * per IP; a taken username is 409 before any hash; then exactly one argon2 hash, outside any
 * transaction; then one transaction that claims the username hold (the lock every sign-up of
 * that username waits on), replaces a stale row of that username, upserts the user by email and
 * upserts its one verification token. A registered email is never changed: its owner gets a notice.
 * The answer never says which email case it was. Mail leaves after the answer, never awaited; a
 * failed send is one warning with the user id only. Database errors propagate (503).
 */
@Injectable()
export class SignUpService implements OnModuleDestroy {
  private readonly logger = new Logger(SignUpService.name);
  private readonly sending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: AuthRateLimiter,
    private readonly secrets: AuthSecrets,
    private readonly hasher: PasswordHasher,
    private readonly mailer: EmailSender,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  async signUp(attempt: SignUpAttempt): Promise<SignUpOutcome> {
    if (!this.mailer.canSend()) return CLOSED;
    const decision = await this.limiter.check(
      perIpHits(this.secrets.hmacKey(), 'sign-up', attempt.ip),
    );
    if (decision.kind === 'limited') {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
    // One instant per request: the hold, the deadline and the token end together.
    const now = this.clock.now();
    const at = {
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + PENDING_SIGN_UP_TTL_MS).toISOString(),
    };
    const usernameKey = normaliseIdentifier(attempt.username);
    if (await this.isUsernameTaken(usernameKey, at.now)) return USERNAME_TAKEN;
    const passwordHash = await this.hasher.hash(attempt.password);
    const token = this.newToken();
    const bindingToken = this.newToken();
    const email = normaliseIdentifier(attempt.email);
    const registration = await this.register({
      newUserId: this.random.uuid(),
      username: attempt.username,
      usernameKey,
      email,
      passwordHash,
      tokenHash: hashAuthToken(token),
      bindingHash: hashAuthToken(bindingToken),
      ...at,
    });
    if (registration.kind === 'username_taken') return USERNAME_TAKEN;
    if (registration.kind === 'pending') {
      this.dispatch(
        {
          kind: 'email_verification',
          to: email,
          username: attempt.username,
          token,
        },
        registration.userId,
      );
    } else {
      this.dispatch({ kind: 'sign_up_notice', to: email }, null);
    }
    return { kind: 'accepted', bindingToken };
  }

  /**
   * POST /auth/email-verification/resend (ADR 0020 Addendum 1e-ii-b). Order: no sender is 403
   * before anything; the attempt is counted per IP; one instant; the token is drawn in every
   * branch; then one transaction that locks the pending account by email and upserts its token.
   * Nothing moves: no column of `app_user` or of the hold is written, the token's deadline is the
   * account's own (copied in SQL) and its binding stays the one the last submit wrote. Any other
   * address is `accepted` too and nothing is sent. No hash, no counter keyed by the email; logs
   * nothing but a failed send (user id only). Database errors propagate (503).
   */
  async resendVerification(
    attempt: ResendVerificationAttempt,
  ): Promise<ResendVerificationOutcome> {
    if (!this.mailer.canSend()) return CLOSED;
    const decision = await this.limiter.check(
      perIpHits(
        this.secrets.hmacKey(),
        'email-verification-resend',
        attempt.ip,
      ),
    );
    if (decision.kind === 'limited') {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
    const now = this.clock.now().toISOString();
    const email = normaliseIdentifier(attempt.email);
    // Drawn whatever the address: the silent cases cost what the pending one costs, bar one upsert.
    const token = this.newToken();
    const pending = await this.reissueVerificationToken(
      email,
      hashAuthToken(token),
      now,
    );
    if (pending !== null) {
      // The read matched `email = <this value>`, so it is the stored address.
      this.dispatch(
        {
          kind: 'email_verification',
          to: email,
          username: pending.username,
          token,
        },
        pending.userId,
      );
    }
    return RESEND_ACCEPTED;
  }

  /**
   * GET /users/availability (ADR 0020 Addendum 1e-iii). Order, never reordered: the attempt is
   * counted per IP; one instant; `normaliseIdentifier`; then the very read sign-up's 409 runs, so
   * the two routes agree in every state (A1). No `canSend()` check: nothing is created, so it
   * answers while sign-up is closed. No hash, no write but the counter, logs nothing. Database
   * errors propagate (503): never an uncounted pass.
   */
  async usernameAvailability(
    check: UsernameAvailabilityCheck,
  ): Promise<UsernameAvailabilityOutcome> {
    const decision = await this.limiter.check(
      perIpHits(this.secrets.hmacKey(), 'username-availability', check.ip),
    );
    if (decision.kind === 'limited') {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
    const now = this.clock.now().toISOString();
    const usernameKey = normaliseIdentifier(check.username);
    return (await this.isUsernameTaken(usernameKey, now)) ? TAKEN : AVAILABLE;
  }

  /** Waits for every send in progress. */
  async settle(): Promise<void> {
    while (this.sending.size > 0) {
      await Promise.allSettled([...this.sending]);
    }
  }

  /** Background work must not outlive the module. */
  async onModuleDestroy(): Promise<void> {
    await this.settle();
  }

  private newToken(): string {
    return this.random.bytes(AUTH_TOKEN_BYTES).toString('base64url');
  }

  /**
   * A reserved name (no read), a live hold, or a user row of that key that is not stale (a null
   * deadline is never stale). Only a read: it saves the hash on the common 409; the claim in
   * `register` is the safe check. Reserved never changes, so `register` needs no second look.
   */
  private async isUsernameTaken(
    usernameKey: NormalisedIdentifier,
    now: string,
  ): Promise<boolean> {
    if (isReservedUsername(usernameKey)) return true;
    const [row] = await this.prisma.$queryRaw<{ taken: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM auth_username_hold
          WHERE username_key = ${usernameKey} AND expires_at > ${now}::timestamptz)
        OR EXISTS (SELECT 1 FROM app_user
          WHERE username_key = ${usernameKey} AND (${stale(now)}) IS NOT TRUE) AS taken`;
    return row?.taken !== false;
  }

  /**
   * Five statements, locks in the order hold, app_user, auth_token (ADR 0020). The hold upsert
   * locks the hold row even when its WHERE fails, so a second sign-up of the username waits for
   * this commit, then claims nothing. Only sign-up writes `username_key`, always under that lock,
   * so the existence check cannot go stale before the upsert.
   */
  private async register(record: SignUpRecord): Promise<Registration> {
    const { usernameKey, now, expiresAt } = record;
    try {
      return await this.prisma.$transaction(
        async (tx): Promise<Registration> => {
          const claimed = await tx.$executeRaw`
          INSERT INTO auth_username_hold AS hold (username_key, expires_at)
          VALUES (${usernameKey}, ${expiresAt}::timestamptz)
          ON CONFLICT (username_key) DO UPDATE SET expires_at = EXCLUDED.expires_at
          WHERE hold.expires_at <= ${now}::timestamptz`;
          if (claimed !== 1) throw new UsernameTakenRollback();
          await tx.$executeRaw`
          DELETE FROM app_user WHERE username_key = ${usernameKey} AND ${stale(now)}`;
          const [kept] = await tx.$queryRaw<{ found: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM app_user WHERE username_key = ${usernameKey}) AS found`;
          if (kept?.found !== false) throw new UsernameTakenRollback();
          // A registered (verified, or no deadline) row matches no WHERE: no row back, unchanged.
          const [user] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO app_user AS account (id, email, username, username_key, password_hash,
            pending_expires_at, created_at, updated_at)
          VALUES (${record.newUserId}::uuid, ${record.email}, ${record.username}, ${usernameKey},
            ${record.passwordHash}, ${expiresAt}::timestamptz, ${now}::timestamptz,
            ${now}::timestamptz)
          ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username,
            username_key = EXCLUDED.username_key, password_hash = EXCLUDED.password_hash,
            pending_expires_at = EXCLUDED.pending_expires_at, updated_at = EXCLUDED.updated_at
          WHERE account.email_verified_at IS NULL AND account.pending_expires_at IS NOT NULL
          RETURNING id::text AS id`;
          if (user === undefined) return { kind: 'registered' };
          // One row per account and purpose: overwriting the hash cancels the older token, and
          // the binding is always the one of the submit that wrote the current password hash.
          await tx.$executeRaw`
          INSERT INTO auth_token (token_hash, purpose, user_id, binding_hash, created_at,
            expires_at)
          VALUES (${record.tokenHash}, 'EMAIL_VERIFICATION'::auth_token_purpose,
            ${user.id}::uuid, ${record.bindingHash}, ${now}::timestamptz,
            ${expiresAt}::timestamptz)
          ON CONFLICT (user_id, purpose) DO UPDATE SET token_hash = EXCLUDED.token_hash,
            binding_hash = EXCLUDED.binding_hash, created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at, used_at = NULL`;
          return { kind: 'pending', userId: user.id };
        },
        // Explicit: the design relies on READ COMMITTED re-reading a row after a lock wait.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof UsernameTakenRollback ||
        isUsernameKeyConflict(error)
      ) {
        return USERNAME_TAKEN;
      }
      throw error;
    }
  }

  /**
   * Two statements, locks in the order app_user, auth_token (sign-up's and the cleanup's order).
   * The user lock is what makes it safe: after waiting on a confirm, a re-submit or the cleanup,
   * READ COMMITTED re-checks the WHERE on the new row version, so a member verified or deleted
   * meanwhile gets no token and no mail. The upsert never names `binding_hash`, so the binding
   * stays (NULL with no previous row: the password path only), and copies `pending_expires_at`
   * inside SQL, so the token ends with the account and no timestamp is read back.
   */
  private async reissueVerificationToken(
    email: NormalisedIdentifier,
    tokenHash: Uint8Array<ArrayBuffer>,
    now: string,
  ): Promise<PendingAccount | null> {
    return this.prisma.$transaction(
      async (tx): Promise<PendingAccount | null> => {
        const [account] = await tx.$queryRaw<
          { id: string; username: string }[]
        >`
        SELECT id::text AS id, username FROM app_user
        WHERE email = ${email} AND email_verified_at IS NULL
          AND pending_expires_at > ${now}::timestamptz
        FOR UPDATE`;
        if (account === undefined) return null;
        await tx.$executeRaw`
        INSERT INTO auth_token (token_hash, purpose, user_id, created_at, expires_at)
        SELECT ${tokenHash}::bytea, 'EMAIL_VERIFICATION'::auth_token_purpose, id,
          ${now}::timestamptz, pending_expires_at
        FROM app_user WHERE id = ${account.id}::uuid
        ON CONFLICT (user_id, purpose) DO UPDATE SET token_hash = EXCLUDED.token_hash,
          created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at, used_at = NULL`;
        return { userId: account.id, username: account.username };
      },
      // Explicit: the lock wait above relies on READ COMMITTED re-reading the row.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Not awaited by the caller; never rejects. `setImmediate` starts the send after this turn of
   * the event loop, so after the answer is written. A synchronous throw in `send` is caught too.
   */
  private dispatch(email: AuthEmail, userId: string | null): void {
    const sending: Promise<void> = new Promise<void>((resolve) => {
      setImmediate(resolve);
    })
      .then(() => this.mailer.send(email))
      .catch(() => {
        this.warnSendFailed(email, userId);
      })
      .finally(() => {
        this.sending.delete(sending);
      });
    this.sending.add(sending);
  }

  /** The kind and the user id only: never the address, the token or the error, which can quote them. */
  private warnSendFailed(email: AuthEmail, userId: string | null): void {
    const owner = userId === null ? 'a registered account' : `user ${userId}`;
    try {
      this.logger.warn(
        `Sending the ${email.kind} email to ${owner} failed; not retried.`,
      );
    } catch {
      // A failing logger must not become an unhandled rejection.
    }
  }
}
