import { createHash } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import {
  type ApiError,
  type EmailVerificationConfirmResponse,
  isEmailVerificationConfirmResponse,
  type SignUpRequest,
  type SignUpResponse,
} from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { InternalKeySettings } from '../common/internal-key.guard';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTestApp,
  FixedClock,
  SequentialRandom,
} from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { Argon2id, type Argon2idInput } from './argon2id';
import { CLIENT_IP_REQUIRED_MESSAGE } from './credential.guard';
import { type AuthEmail, EmailSender } from './email-sender';
import { SIGN_UP_CLOSED_MESSAGE } from './auth.controller';
import { AuthRateLimiter } from './auth-rate-limiter';
import {
  AUTH_TOKEN_INVALID_MESSAGE,
  CONFIRM_LIMITED_MESSAGE,
  CONFIRM_PASSWORD_INVALID_MESSAGE,
  RESEND_LIMITED_MESSAGE,
} from './email-verification.controller';
import { PasswordHasher } from './password-hasher';
import { SessionService } from './session.service';
import { SESSION_IDLE_MS, SESSION_TOKEN_PATTERN } from './session-rules';
import { SignUpService } from './sign-up.service';
import { hashAuthToken } from './sign-up-rules';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Obvious fakes: keys of 64 characters, documentation IPs (RFC 5737), example.test addresses.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.9';
const ATTACKER_IP = '192.0.2.66';
const WEB = { 'X-Internal-Api-Key': FAKE_KEY, 'X-Client-Ip': IP };
const PASSWORD = 'fake password 1 for tests';
const ATTACKER_PASSWORD = 'fake attacker password 2';
const WRONG_PASSWORD = 'fake wrong password 3';
const WRONG_BINDING = 'fake-wrong-binding-token-'.padEnd(43, 'Z');
const UNKNOWN_TOKEN = 'fake-unknown-token-'.padEnd(43, 'U');
const SIGN_UP: SignUpRequest = {
  username: 'Frieren',
  email: 'frieren@example.test',
  password: PASSWORD,
};
const HIMMEL: SignUpRequest = {
  username: 'Himmel',
  email: 'himmel@example.test',
  password: 'fake password 4 for himmel',
};
const TOKEN_INVALID = {
  error: { code: 'AUTH_TOKEN_INVALID', message: AUTH_TOKEN_INVALID_MESSAGE },
};
const PASSWORD_INVALID = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: CONFIRM_PASSWORD_INVALID_MESSAGE,
  },
};
const LIMITED = {
  error: { code: 'TOO_MANY_REQUESTS', message: CONFIRM_LIMITED_MESSAGE },
};

type TransactionClient = Prisma.TransactionClient;

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
/** Outside SequentialRandom's ids (variant 8), so a seeded row never collides with a new one. */
const id = (n: number): string =>
  `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

/** Fast stand-in that counts derivations; `holdNext` makes only the next one wait. */
class HoldingArgon2id extends Argon2id {
  derives = 0;
  private held: Promise<void> | null = null;

  holdNext(): () => void {
    let release: () => void = () => undefined;
    this.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => release();
  }

  async derive(input: Argon2idInput): Promise<Buffer> {
    this.derives += 1;
    const held = this.held;
    this.held = null;
    if (held !== null) await held;
    return createHash('shake256', { outputLength: input.tagLength })
      .update(input.password)
      .update(input.salt)
      .digest();
  }
}

/** Keeps every email: the test reads the token from the victim's mailbox, as only they could. */
class RecordingEmailSender extends EmailSender {
  readonly sent: AuthEmail[] = [];

  canSend(): boolean {
    return true;
  }

  send(email: AuthEmail): Promise<void> {
    this.sent.push(email);
    return Promise.resolve();
  }
}

interface PendingSignUp {
  readonly userId: string;
  /** In the mailbox of the address. */
  readonly token: string;
  /** In the `ol_signup` cookie of the browser that submitted. */
  readonly bindingToken: string;
}

const argon2 = new HoldingArgon2id();
const mail = new RecordingEmailSender();

describe('POST /auth/email-verification', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasher;
  let signUps: SignUpService;

  const from = (ip: string): Record<string, string> => ({
    ...WEB,
    'X-Client-Ip': ip,
  });
  const confirm = (body: object, headers: Record<string, string> = WEB) =>
    request(app.getHttpServer())
      .post('/auth/email-verification/confirm')
      .set(headers)
      .send(body);

  /** Through the real route, so the hash, the token and its binding are what sign-up wrote. */
  async function signUp(
    body: SignUpRequest = SIGN_UP,
    ip: string = IP,
  ): Promise<PendingSignUp> {
    const response = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .set(from(ip))
      .send(body)
      .expect(202);
    await signUps.settle();
    const email = mail.sent.findLast(
      (sent) => sent.kind === 'email_verification' && sent.to === body.email,
    );
    if (email?.kind !== 'email_verification') {
      throw new Error('No verification email was sent');
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: body.email },
    });
    return {
      userId: user.id,
      token: email.token,
      bindingToken: (response.body as SignUpResponse).bindingToken,
    };
  }

  async function seedPendingUser(n: number): Promise<string> {
    const userId = id(n);
    await prisma.user.create({
      data: {
        id: userId,
        email: `member${n}@example.test`,
        username: `Member${n}`,
        usernameKey: `member${n}`,
        passwordHash: await hasher.hash(PASSWORD),
        pendingExpiresAt: at(DAY),
        createdAt: at(-HOUR),
        updatedAt: at(-HOUR),
      },
    });
    return userId;
  }

  async function seedToken(
    token: string,
    userId: string,
    row: {
      readonly bindingToken?: string;
      readonly expiresAt: Date;
      readonly usedAt?: Date;
      readonly purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
    },
  ): Promise<void> {
    await prisma.authToken.create({
      data: {
        tokenHash: hashAuthToken(token),
        purpose: row.purpose ?? 'EMAIL_VERIFICATION',
        userId,
        bindingHash:
          row.bindingToken === undefined
            ? null
            : hashAuthToken(row.bindingToken),
        createdAt: at(-HOUR),
        expiresAt: row.expiresAt,
        usedAt: row.usedAt ?? null,
      },
    });
  }

  /** The account and its token exactly as sign-up left them: nothing consumed, nothing verified. */
  async function expectUntouched(pending: PendingSignUp): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: pending.userId },
    });
    expect(user).toMatchObject({
      emailVerifiedAt: null,
      pendingExpiresAt: at(DAY),
    });
    const token = await prisma.authToken.findUniqueOrThrow({
      where: { tokenHash: hashAuthToken(pending.token) },
    });
    expect(token.usedAt).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  }

  /** Until `count` other connections wait on a row lock: those requests are blocked at their FOR UPDATE. */
  async function waitForLockWaiter(count = 1): Promise<void> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if ((row?.waiting ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('No request waited on the user row lock');
  }

  async function waitForDerives(count: number): Promise<void> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (argon2.derives >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Only ${argon2.derives} of ${count} hashes started`);
  }

  beforeAll(async () => {
    app = await createTestApp({
      clock: new FixedClock(NOW),
      random: new SequentialRandom(),
      overrides: [
        {
          provide: InternalKeySettings,
          useValue: {
            get: () => ({
              kind: 'enforced',
              acceptedKeys: [FAKE_KEY],
              previewKey: FAKE_PREVIEW_KEY,
            }),
          },
        },
        { provide: Argon2id, useValue: argon2 },
        { provide: EmailSender, useValue: mail },
      ],
    });
    prisma = app.get(PrismaService);
    hasher = app.get(PasswordHasher);
    signUps = app.get(SignUpService);
  });

  beforeEach(async () => {
    await signUps.settle();
    await truncateAllTables(prisma);
    argon2.derives = 0;
    mail.sent.splice(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('verifies on the binding path with a session that works on GET /me, with no password check', async () => {
    const pending = await signUp();
    const derives = argon2.derives;

    const response = await confirm({
      token: pending.token,
      bindingToken: pending.bindingToken,
    }).expect(200);

    const body = response.body as EmailVerificationConfirmResponse;
    expect(isEmailVerificationConfirmResponse(body)).toBe(true);
    expect(body).toEqual({
      outcome: 'verified',
      session: {
        sessionToken: expect.stringMatching(SESSION_TOKEN_PATTERN) as string,
        expiresAt: at(SESSION_IDLE_MS).toISOString(),
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(argon2.derives).toBe(derives);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } }),
    ).toMatchObject({
      emailVerifiedAt: NOW,
      pendingExpiresAt: null,
      updatedAt: NOW,
    });
    expect(
      await prisma.authToken.findUniqueOrThrow({
        where: { tokenHash: hashAuthToken(pending.token) },
      }),
    ).toMatchObject({ usedAt: NOW });
    // The sign-up counter and the confirm per-IP counter; no password counter on this path.
    expect(await prisma.authRateLimit.count()).toBe(2);
    const session = body.outcome === 'verified' ? body.session : null;
    const me = await request(app.getHttpServer())
      .get('/me')
      .set({ ...WEB, Authorization: `Bearer ${session?.sessionToken ?? ''}` })
      .expect(200);
    expect(me.body).toEqual({ id: pending.userId, username: 'Frieren' });
  });

  it.each<[string, Record<string, string>]>([
    ['no binding', {}],
    ['a wrong binding', { bindingToken: WRONG_BINDING }],
  ])(
    'verifies with the sign-up password and %s, gives no session, and the member then signs in',
    async (_, binding) => {
      const pending = await signUp();
      const derives = argon2.derives;

      const response = await confirm({
        token: pending.token,
        ...binding,
        password: PASSWORD,
      }).expect(200);

      expect(response.body).toEqual({ outcome: 'verified', session: null });
      expect(argon2.derives).toBe(derives + 1);
      expect(await prisma.session.count()).toBe(0);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } }),
      ).toMatchObject({ emailVerifiedAt: NOW, pendingExpiresAt: null });
      // Sign-up, confirm per IP, and the account's password counter.
      expect(await prisma.authRateLimit.count()).toBe(3);
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .set(WEB)
        .send({ identifier: SIGN_UP.email, password: PASSWORD })
        .expect(200);
    },
  );

  it('answers confirmation_required and consumes nothing without a binding, with a wrong one, or with another account binding', async () => {
    const frieren = await signUp(SIGN_UP, IP);
    const himmel = await signUp(HIMMEL, OTHER_IP);
    const derives = argon2.derives;

    for (const binding of [
      {},
      { bindingToken: WRONG_BINDING },
      { bindingToken: himmel.bindingToken },
    ]) {
      const response = await confirm({
        token: frieren.token,
        ...binding,
      }).expect(200);
      expect(response.body).toEqual({ outcome: 'confirmation_required' });
    }

    expect(argon2.derives).toBe(derives);
    await expectUntouched(frieren);
    // Two sign-ups and the confirm per-IP counter: no password counter without a password.
    expect(await prisma.authRateLimit.count()).toBe(3);
    await confirm({
      token: frieren.token,
      bindingToken: frieren.bindingToken,
    }).expect(200);
  });

  it('refuses a wrong password with 401, consumes nothing and logs no secret; the binding still works after', async () => {
    const pending = await signUp();
    const logged = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (level) =>
        vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

    const response = await confirm({
      token: pending.token,
      password: WRONG_PASSWORD,
    }).expect(401);

    expect(response.body).toEqual(PASSWORD_INVALID);
    expect(response.text).not.toContain(WRONG_PASSWORD);
    expect(response.text).not.toContain(pending.token);
    await expectUntouched(pending);
    // Only the request line (path, status) may be written: no secret, address or warning.
    const lines = JSON.stringify(logged.map((spy) => spy.mock.calls));
    for (const secret of [WRONG_PASSWORD, pending.token, SIGN_UP.email]) {
      expect(lines).not.toContain(secret);
    }
    expect(logged[1]).not.toHaveBeenCalled();
    expect(logged[2]).not.toHaveBeenCalled();
    await confirm({
      token: pending.token,
      bindingToken: pending.bindingToken,
    }).expect(200);
  });

  it("never verifies one account with another account's password (wrong user)", async () => {
    const frieren = await signUp(SIGN_UP, IP);
    await signUp(HIMMEL, OTHER_IP);

    await confirm({ token: frieren.token, password: HIMMEL.password }).expect(
      401,
    );

    await expectUntouched(frieren);
  });

  it("H1: someone who pre-registers the victim's address never gets the account, whatever the victim does", async () => {
    // The attacker submits the victim's address with their own password: they hold the binding.
    const attacker = await signUp(
      { ...SIGN_UP, password: ATTACKER_PASSWORD },
      ATTACKER_IP,
    );

    // The victim clicks the mailed link in a browser without the attacker's ol_signup.
    const click = await confirm({ token: attacker.token }).expect(200);
    expect(click.body).toEqual({ outcome: 'confirmation_required' });
    // The victim types their own password: it is not the pending hash.
    const typed = await confirm({
      token: attacker.token,
      password: PASSWORD,
    }).expect(401);
    expect(typed.body).toEqual(PASSWORD_INVALID);
    // The attacker never holds the token: a guess with their binding is just an unknown token.
    const guess = await confirm(
      { token: UNKNOWN_TOKEN, bindingToken: attacker.bindingToken },
      from(ATTACKER_IP),
    ).expect(400);
    expect(guess.body).toEqual(TOKEN_INVALID);

    await expectUntouched(attacker);
    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set(from(ATTACKER_IP))
      .send({ identifier: SIGN_UP.email, password: ATTACKER_PASSWORD })
      .expect(401);
  });

  it("M2: a re-submit while the victim is pending kills the victim's link and gates the new one behind the attacker's password", async () => {
    const victim = await signUp(SIGN_UP, IP);
    const attacker = await signUp(
      {
        username: 'Mallory',
        email: SIGN_UP.email,
        password: ATTACKER_PASSWORD,
      },
      ATTACKER_IP,
    );
    expect(attacker.userId).toBe(victim.userId);

    // The victim's first link was deleted by the re-submit.
    const old = await confirm({
      token: victim.token,
      bindingToken: victim.bindingToken,
    }).expect(400);
    expect(old.body).toEqual(TOKEN_INVALID);
    // The new link reaches the victim; their ol_signup holds the old binding.
    const click = await confirm({
      token: attacker.token,
      bindingToken: victim.bindingToken,
    }).expect(200);
    expect(click.body).toEqual({ outcome: 'confirmation_required' });
    const typed = await confirm({
      token: attacker.token,
      password: PASSWORD,
    }).expect(401);
    expect(typed.body).toEqual(PASSWORD_INVALID);

    await expectUntouched(attacker);
  });

  it('C1: a re-submit that lands while the password is checked activates nothing', async () => {
    const victim = await signUp(SIGN_UP, IP);
    const release = argon2.holdNext();
    const confirming = confirm({
      token: victim.token,
      password: PASSWORD,
    }).then((response) => response);
    await waitForDerives(2);

    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .set(from(ATTACKER_IP))
      .send({
        username: 'Mallory',
        email: SIGN_UP.email,
        password: ATTACKER_PASSWORD,
      })
      .expect(202);
    release();
    const response = await confirming;

    expect(response.status).toBe(400);
    expect(response.body).toEqual(TOKEN_INVALID);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: victim.userId },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(await hasher.verify(ATTACKER_PASSWORD, user.passwordHash)).toBe(
      'match',
    );
    expect(
      await prisma.authToken.count({ where: { usedAt: { not: null } } }),
    ).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('C1: activates nothing when the pending hash changes during the check, even with the token still live', async () => {
    const victim = await signUp(SIGN_UP, IP);
    const release = argon2.holdNext();
    const confirming = confirm({
      token: victim.token,
      password: PASSWORD,
    }).then((response) => response);
    await waitForDerives(2);

    // No route does this today (re-submit deletes the token): it pins the predicate on the hash.
    await prisma.user.update({
      where: { id: victim.userId },
      data: { passwordHash: '$argon2id$fake-other-hash' },
    });
    release();
    const response = await confirming;

    expect(response.status).toBe(400);
    expect(response.body).toEqual(TOKEN_INVALID);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } }),
    ).toMatchObject({ emailVerifiedAt: null });
    expect(
      await prisma.authToken.findUniqueOrThrow({
        where: { tokenHash: hashAuthToken(victim.token) },
      }),
    ).toMatchObject({ usedAt: null });
  });

  it('answers already_verified to a password confirm that loses the race to the binding path: one session', async () => {
    const pending = await signUp();
    const release = argon2.holdNext();
    const byPassword = confirm(
      { token: pending.token, password: PASSWORD },
      from(OTHER_IP),
    ).then((response) => response);
    await waitForDerives(2);

    const byBinding = await confirm({
      token: pending.token,
      bindingToken: pending.bindingToken,
    }).expect(200);
    release();
    const response = await byPassword;

    expect((byBinding.body as EmailVerificationConfirmResponse).outcome).toBe(
      'verified',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'already_verified' });
    expect(await prisma.session.count()).toBe(1);
  });

  it('answers 400, not 500, when the cleanup deletes the user while the password is checked', async () => {
    const pending = await signUp();
    const release = argon2.holdNext();
    const confirming = confirm({
      token: pending.token,
      password: PASSWORD,
    }).then((response) => response);
    await waitForDerives(2);

    await prisma.user.delete({ where: { id: pending.userId } });
    release();
    const response = await confirming;

    expect(response.status).toBe(400);
    expect(response.body).toEqual(TOKEN_INVALID);
    expect(await prisma.session.count()).toBe(0);
  });

  it('keeps the member verified when the session insert fails after commit; the retry is already_verified', async () => {
    const pending = await signUp();
    vi.spyOn(app.get(SessionService), 'create').mockRejectedValueOnce(
      new Error('fake session insert failure'),
    );
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const body = { token: pending.token, bindingToken: pending.bindingToken };

    const failed = await confirm(body);
    const retry = await confirm(body).expect(200);

    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(failed.text).not.toContain(pending.token);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } }),
    ).toMatchObject({ emailVerifiedAt: NOW });
    expect(retry.body).toEqual({ outcome: 'already_verified' });
    expect(await prisma.session.count()).toBe(0);
  });

  it.each<[string, (tx: TransactionClient, userId: string) => Promise<void>]>([
    [
      'a re-submit (new hash, token replaced)',
      async (tx, userId) => {
        await tx.$executeRaw`
          UPDATE app_user SET password_hash = '$argon2id$fake-attacker-hash'
          WHERE id = ${userId}::uuid`;
        await tx.$executeRaw`
          DELETE FROM auth_token WHERE user_id = ${userId}::uuid`;
        await tx.authToken.create({
          data: {
            tokenHash: hashAuthToken('fake-attacker-token'),
            purpose: 'EMAIL_VERIFICATION',
            userId,
            bindingHash: hashAuthToken('fake-attacker-binding'),
            createdAt: NOW,
            expiresAt: at(DAY),
          },
        });
      },
    ],
    [
      'the cleanup deleting the user',
      async (tx, userId) => {
        await tx.$executeRaw`DELETE FROM app_user WHERE id = ${userId}::uuid`;
      },
    ],
  ])(
    'answers 400 on the binding path when %s commits while the confirm waits on the user lock',
    async (_, write) => {
      const pending = await signUp();
      let confirming: Promise<request.Response> | null = null;

      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM app_user WHERE id = ${pending.userId}::uuid FOR UPDATE`;
          confirming = confirm({
            token: pending.token,
            bindingToken: pending.bindingToken,
          }).then((response) => response);
          await waitForLockWaiter();
          await write(tx, pending.userId);
        },
        { timeout: 10_000 },
      );
      const response = await (confirming as Promise<request.Response> | null);

      expect(response?.status).toBe(400);
      expect(response?.body).toEqual(TOKEN_INVALID);
      expect(
        await prisma.user.count({
          where: { id: pending.userId, emailVerifiedAt: { not: null } },
        }),
      ).toBe(0);
      expect(await prisma.session.count()).toBe(0);
    },
  );

  it('answers already_verified to a replay, with or without proof, never with a second session or a hash', async () => {
    const pending = await signUp();
    await confirm({
      token: pending.token,
      bindingToken: pending.bindingToken,
    }).expect(200);
    const derives = argon2.derives;

    for (const proof of [
      { bindingToken: pending.bindingToken },
      { password: PASSWORD },
      { password: WRONG_PASSWORD },
      {},
    ]) {
      const replay = await confirm({ token: pending.token, ...proof }).expect(
        200,
      );
      expect(replay.body).toEqual({ outcome: 'already_verified' });
      expect(replay.headers['cache-control']).toBe('no-store');
    }

    expect(argon2.derives).toBe(derives);
    expect(await prisma.session.count()).toBe(1);
  });

  it('treats a token as ended at its expires_at instant and live 1 ms before', async () => {
    const ended = await seedPendingUser(1);
    const live = await seedPendingUser(2);
    await seedToken('fake-ended-token', ended, {
      bindingToken: 'fake-binding-1',
      expiresAt: NOW,
    });
    await seedToken('fake-live-token', live, {
      bindingToken: 'fake-binding-2',
      expiresAt: at(1),
    });

    const refused = await confirm({
      token: 'fake-ended-token',
      bindingToken: 'fake-binding-1',
    }).expect(400);
    const accepted = await confirm({
      token: 'fake-live-token',
      bindingToken: 'fake-binding-2',
    }).expect(200);

    expect(refused.body).toEqual(TOKEN_INVALID);
    expect((accepted.body as EmailVerificationConfirmResponse).outcome).toBe(
      'verified',
    );
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: ended } }),
    ).toMatchObject({ emailVerifiedAt: null });
  });

  it.each<[string, Record<string, unknown>]>([
    ['an unknown token', { token: UNKNOWN_TOKEN }],
    ['a short token', { token: 'abc' }],
    ['a token of 128 characters', { token: 'A'.repeat(128) }],
    ['a used token of an unverified user', { token: 'fake-used-token' }],
    ['a password-reset token', { token: 'fake-reset-token' }],
  ])(
    'answers 400 AUTH_TOKEN_INVALID to %s, without a hash',
    async (_, body) => {
      const userId = await seedPendingUser(1);
      await seedToken('fake-used-token', userId, {
        bindingToken: 'fake-binding',
        expiresAt: at(HOUR),
        usedAt: at(-1),
      });
      await seedToken('fake-reset-token', userId, {
        expiresAt: at(HOUR),
        purpose: 'PASSWORD_RESET',
      });
      const derives = argon2.derives;

      const response = await confirm({
        ...body,
        bindingToken: 'fake-binding',
        password: PASSWORD,
      }).expect(400);

      expect(response.body).toEqual(TOKEN_INVALID);
      expect(argon2.derives).toBe(derives);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      ).toMatchObject({ emailVerifiedAt: null });
    },
  );

  it('gives exactly one verified, one session and no 500 to five confirms of one token at once', async () => {
    const pending = await signUp();

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        confirm(
          { token: pending.token, bindingToken: pending.bindingToken },
          from(`198.51.100.${n}`),
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const outcomes = responses.map(
      (response) => (response.body as EmailVerificationConfirmResponse).outcome,
    );
    expect(outcomes.sort()).toEqual([
      'already_verified',
      'already_verified',
      'already_verified',
      'already_verified',
      'verified',
    ]);
    expect(await prisma.session.count()).toBe(1);
  });

  it('refuses the 11th confirm from one IP in 15 min without a hash (brute force); another IP still confirms', async () => {
    const pending = await signUp();
    for (let n = 0; n < 10; n += 1) {
      await confirm({ token: `${UNKNOWN_TOKEN}${n}` }).expect(400);
    }
    const derives = argon2.derives;

    const refused = await confirm({
      token: pending.token,
      password: PASSWORD,
    }).expect(429);

    expect(refused.body).toEqual(LIMITED);
    expect(refused.headers['retry-after']).toBe('900');
    expect(argon2.derives).toBe(derives);
    await expectUntouched(pending);
    await confirm(
      { token: pending.token, password: PASSWORD },
      from(OTHER_IP),
    ).expect(200);
  });

  it('refuses the 11th password check of one account in an hour across IPs without a hash; the binding still works', async () => {
    const pending = await signUp();
    for (let n = 1; n <= 10; n += 1) {
      await confirm(
        { token: pending.token, password: `${WRONG_PASSWORD} ${n}` },
        from(`198.51.100.${n}`),
      ).expect(401);
    }
    const derives = argon2.derives;

    const refused = await confirm(
      { token: pending.token, password: PASSWORD },
      from('198.51.100.11'),
    ).expect(429);

    expect(refused.body).toEqual(LIMITED);
    expect(refused.headers['retry-after']).toBe('3600');
    expect(argon2.derives).toBe(derives);
    await expectUntouched(pending);
    await confirm(
      { token: pending.token, bindingToken: pending.bindingToken },
      from('198.51.100.12'),
    ).expect(200);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a missing token', { bindingToken: WRONG_BINDING }],
    ['a null bindingToken', { token: UNKNOWN_TOKEN, bindingToken: null }],
    ['an empty password', { token: UNKNOWN_TOKEN, password: '' }],
    ['a token of 129 characters', { token: 'A'.repeat(129) }],
    [
      'a userId field (the member never comes from the body)',
      { token: UNKNOWN_TOKEN, userId: id(1) },
    ],
  ])(
    'answers 400 VALIDATION_FAILED to %s, before any counter or hash',
    async (_, body) => {
      const response = await confirm(body).expect(400);

      expect((response.body as ApiError).error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(argon2.derives).toBe(0);
    },
  );

  it.each<[string, Record<string, string>]>([
    ['no X-Client-Ip', { 'X-Internal-Api-Key': FAKE_KEY }],
    ['a malformed X-Client-Ip', from('not-an-ip')],
  ])('answers 400 to %s, before any counter or hash', async (_, headers) => {
    const pending = await signUp();
    const counters = await prisma.authRateLimit.count();

    const response = await confirm(
      { token: pending.token, bindingToken: pending.bindingToken },
      headers,
    ).expect(400);

    expect(response.body).toEqual({
      error: { code: 'BAD_REQUEST', message: CLIENT_IP_REQUIRED_MESSAGE },
    });
    expect(await prisma.authRateLimit.count()).toBe(counters);
    await expectUntouched(pending);
  });

  it.each<[string, Record<string, string>]>([
    ['the preview key', { ...WEB, 'X-Internal-Api-Key': FAKE_PREVIEW_KEY }],
    ['no internal key', { 'X-Client-Ip': IP }],
    ['a wrong internal key', { ...WEB, 'X-Internal-Api-Key': 'x'.repeat(64) }],
  ])('answers 403 to %s, before any counter or hash', async (_, headers) => {
    const pending = await signUp();
    const counters = await prisma.authRateLimit.count();

    const response = await confirm(
      { token: pending.token, bindingToken: pending.bindingToken },
      headers,
    ).expect(403);

    expect((response.body as ApiError).error.code).toBe(
      'INTERNAL_KEY_REQUIRED',
    );
    expect(await prisma.authRateLimit.count()).toBe(counters);
    await expectUntouched(pending);
  });
  describe('resend (ADR 0020 Addendum 1e-ii-b)', () => {
    const RESEND_LIMITED = {
      error: { code: 'TOO_MANY_REQUESTS', message: RESEND_LIMITED_MESSAGE },
    };
    const hex = (value: Uint8Array | null): string | null =>
      value === null ? null : Buffer.from(value).toString('hex');
    /** The hash of a token as `tokenRows` shows it. */
    const hexHash = (token: string): string | null => hex(hashAuthToken(token));

    /** Token rows with hex hashes: Prisma reads bytes as a Uint8Array, hashAuthToken gives a Buffer. */
    async function tokenRows(where: Prisma.AuthTokenWhereInput = {}) {
      const rows = await prisma.authToken.findMany({
        where,
        orderBy: { purpose: 'asc' },
      });
      return rows.map((row) => ({
        ...row,
        tokenHash: hex(row.tokenHash),
        bindingHash: hex(row.bindingHash),
      }));
    }

    const resend = (body: object, headers: Record<string, string> = WEB) =>
      request(app.getHttpServer())
        .post('/auth/email-verification/resend')
        .set(headers)
        .send(body);

    /** Everything a caller sees, minus the per-request date and request id. */
    const answer = (response: request.Response) => ({
      status: response.status,
      text: response.text,
      headers: Object.fromEntries(
        Object.entries(response.headers).filter(
          ([name]) => name !== 'date' && name !== 'x-request-id',
        ),
      ),
    });

    /** The verification mails sent so far, once every send settled. */
    async function verificationMails(): Promise<
      Extract<AuthEmail, { kind: 'email_verification' }>[]
    > {
      await signUps.settle();
      return mail.sent.filter(
        (sent): sent is Extract<AuthEmail, { kind: 'email_verification' }> =>
          sent.kind === 'email_verification',
      );
    }

    async function lastMailedToken(): Promise<string> {
      const token = (await verificationMails()).at(-1)?.token;
      if (token === undefined) throw new Error('No verification email');
      return token;
    }

    /** A row written directly, with a deadline sign-up would never pick, so a copy is visible. */
    async function seedAccount(
      n: number,
      row: {
        readonly pendingExpiresAt: Date | null;
        readonly verified?: boolean;
      },
    ): Promise<string> {
      const userId = id(n);
      await prisma.user.create({
        data: {
          id: userId,
          email: `member${n}@example.test`,
          username: `Member${n}`,
          usernameKey: `member${n}`,
          passwordHash: `$argon2id$fake-hash-${n}`,
          emailVerifiedAt: row.verified === true ? at(-HOUR) : null,
          pendingExpiresAt: row.pendingExpiresAt,
          createdAt: at(-2 * HOUR),
          updatedAt: at(-2 * HOUR),
        },
      });
      return userId;
    }

    async function snapshot(userId: string) {
      return {
        user: await prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        tokens: await prisma.authToken.findMany({
          where: { userId },
          orderBy: { purpose: 'asc' },
        }),
        holds: await prisma.usernameHold.findMany(),
      };
    }

    it('mails a new link to a pending account: same binding, same deadline, nothing else moves', async () => {
      const pending = await signUp();
      const before = await snapshot(pending.userId);
      const derives = argon2.derives;

      const response = await resend({ email: SIGN_UP.email }).expect(202);

      expect(response.body).toEqual({});
      expect(response.headers['cache-control']).toBe('no-store');
      const mails = await verificationMails();
      expect(mails).toHaveLength(2);
      const newToken = await lastMailedToken();
      expect(mails[1]).toEqual({
        kind: 'email_verification',
        to: 'frieren@example.test',
        username: 'Frieren',
        token: newToken,
      });
      expect(newToken).not.toBe(pending.token);
      const after = await snapshot(pending.userId);
      expect(after.user).toEqual(before.user);
      expect(after.holds).toEqual(before.holds);
      expect(after.tokens).toHaveLength(1);
      expect(hex(after.tokens[0]?.tokenHash ?? null)).toBe(hexHash(newToken));
      expect(hex(after.tokens[0]?.bindingHash ?? null)).toBe(
        hex(before.tokens[0]?.bindingHash ?? null),
      );
      expect(after.tokens[0]).toMatchObject({
        createdAt: NOW,
        expiresAt: before.user.pendingExpiresAt,
        usedAt: null,
      });
      expect(argon2.derives).toBe(derives);
      // Sign-up's and resend's per-IP counters; none keyed by the email.
      expect(await prisma.authRateLimit.count()).toBe(2);

      // The older link is dead (a replay); the new one still confirms in one click.
      await confirm({
        token: pending.token,
        bindingToken: pending.bindingToken,
      }).expect(400, TOKEN_INVALID);
      const confirmed = await confirm({
        token: newToken,
        bindingToken: pending.bindingToken,
      }).expect(200);
      expect(confirmed.body).toMatchObject({ outcome: 'verified' });
      expect(await prisma.session.count()).toBe(1);
    });

    it('copies the deadline to the millisecond and writes no column of the account or the hold', async () => {
      const deadline = at(5 * HOUR + 123);
      const userId = await seedAccount(1, { pendingExpiresAt: deadline });
      await seedToken('fake-old-token', userId, {
        bindingToken: 'fake-old-binding',
        expiresAt: deadline,
      });
      await prisma.usernameHold.create({
        data: { usernameKey: 'member1', expiresAt: at(3 * HOUR + 7) },
      });
      const before = await snapshot(userId);

      await resend({ email: 'member1@example.test' }).expect(202, {});

      const after = await snapshot(userId);
      expect(after.user).toEqual(before.user);
      expect(after.holds).toEqual(before.holds);
      expect(await tokenRows({ userId })).toEqual([
        {
          tokenHash: hexHash(await lastMailedToken()),
          purpose: 'EMAIL_VERIFICATION',
          userId,
          bindingHash: hexHash('fake-old-binding'),
          createdAt: NOW,
          expiresAt: deadline,
          usedAt: null,
        },
      ]);
      expect(await prisma.authRateLimit.count()).toBe(1);
    });

    it('matches an address typed with spaces and capitals, and mails the stored one', async () => {
      await signUp();

      await resend({ email: '  FRIEREN@Example.TEST ' }).expect(202, {});

      expect((await verificationMails()).at(-1)).toMatchObject({
        to: 'frieren@example.test',
        username: 'Frieren',
      });
    });

    it.each<[string, (n: number) => Promise<string | null>]>([
      ['an unknown address', () => Promise.resolve(null)],
      [
        'a verified account',
        (n) => seedAccount(n, { pendingExpiresAt: null, verified: true }),
      ],
      [
        'an account at its deadline (stale)',
        (n) => seedAccount(n, { pendingExpiresAt: NOW }),
      ],
      [
        'an unverified account with no deadline',
        (n) => seedAccount(n, { pendingExpiresAt: null }),
      ],
    ])(
      'answers %s exactly like a pending one, sends nothing and changes nothing',
      async (_, seed) => {
        const pendingId = await seedAccount(1, { pendingExpiresAt: at(DAY) });
        const silentId = await seed(2);
        if (silentId !== null) {
          await seedToken('fake-silent-token', silentId, {
            bindingToken: 'fake-silent-binding',
            expiresAt: at(DAY),
            usedAt: at(-HOUR),
          });
        }
        const before = silentId === null ? null : await snapshot(silentId);
        const derives = argon2.derives;

        const silent = await resend({ email: 'member2@example.test' });
        const pending = await resend({ email: 'member1@example.test' });

        expect(answer(silent)).toEqual(answer(pending));
        expect(silent.status).toBe(202);
        const mails = await verificationMails();
        expect(mails.map((sent) => sent.to)).toEqual(['member1@example.test']);
        if (silentId !== null) {
          expect(await snapshot(silentId)).toEqual(before);
        }
        expect(
          await prisma.authToken.count({ where: { userId: pendingId } }),
        ).toBe(1);
        expect(argon2.derives).toBe(derives);
      },
    );

    it('mails an account 1 ms before its deadline, with a token ending at that instant', async () => {
      const userId = await seedAccount(1, { pendingExpiresAt: at(1) });

      await resend({ email: 'member1@example.test' }).expect(202, {});

      expect(await verificationMails()).toHaveLength(1);
      expect(
        await prisma.authToken.findUniqueOrThrow({
          where: { tokenHash: hashAuthToken(await lastMailedToken()) },
        }),
      ).toMatchObject({ userId, expiresAt: at(1), bindingHash: null });
    });

    it('creates a token with no binding when none existed: confirming then needs the password', async () => {
      const userId = await seedPendingUser(1);

      await resend({ email: 'member1@example.test' }).expect(202, {});

      const token = await lastMailedToken();
      expect(await prisma.authToken.findMany({ where: { userId } })).toEqual([
        expect.objectContaining({ bindingHash: null }) as unknown,
      ]);
      await confirm({ token, bindingToken: WRONG_BINDING }).expect(200, {
        outcome: 'confirmation_required',
      });
      await confirm({ token, password: PASSWORD }).expect(200, {
        outcome: 'verified',
        session: null,
      });
    });

    it('revives a used token of an unverified account as a live one, its binding kept', async () => {
      const userId = await seedPendingUser(1);
      await seedToken('fake-used-token', userId, {
        bindingToken: 'fake-kept-binding',
        expiresAt: at(DAY),
        usedAt: at(-HOUR),
      });

      await resend({ email: 'member1@example.test' }).expect(202, {});

      const token = await lastMailedToken();
      expect(await tokenRows({ userId })).toEqual([
        expect.objectContaining({
          tokenHash: hexHash(token),
          bindingHash: hexHash('fake-kept-binding'),
          usedAt: null,
        }) as unknown,
      ]);
      await confirm({ token, bindingToken: 'fake-kept-binding' }).expect(200);
      expect(await prisma.session.count()).toBe(1);
    });

    it("never touches another account's token or a reset token of the same account (wrong user, other purpose)", async () => {
      const frieren = await signUp();
      const himmel = await signUp(HIMMEL);
      await seedToken('fake-reset-token', frieren.userId, {
        purpose: 'PASSWORD_RESET',
        expiresAt: at(HOUR),
      });
      const himmelBefore = await snapshot(himmel.userId);
      const resetBefore = await prisma.authToken.findUniqueOrThrow({
        where: { tokenHash: hashAuthToken('fake-reset-token') },
      });

      await resend({ email: SIGN_UP.email }).expect(202, {});

      expect(await snapshot(himmel.userId)).toEqual(himmelBefore);
      expect(
        await prisma.authToken.findUniqueOrThrow({
          where: { tokenHash: hashAuthToken('fake-reset-token') },
        }),
      ).toEqual(resetBefore);
      expect(
        await prisma.authToken.count({ where: { userId: frieren.userId } }),
      ).toBe(2);
    });

    it('refuses the 11th resend from one IP in an hour, whatever the address (brute force); another IP still gets 202', async () => {
      await seedAccount(1, { pendingExpiresAt: at(DAY) });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await resend({ email: 'member1@example.test' }).expect(202);
      }

      const refused = await resend({ email: 'member1@example.test' }).expect(
        429,
      );
      const otherAddress = await resend({
        email: 'member9@example.test',
      }).expect(429);
      await resend({ email: 'member1@example.test' }, from(OTHER_IP)).expect(
        202,
        {},
      );

      expect(refused.body).toEqual(RESEND_LIMITED);
      expect(refused.headers['retry-after']).toBe('3600');
      expect(refused.headers['cache-control']).toBe('no-store');
      expect(otherAddress.body).toEqual(RESEND_LIMITED);
      // 10 from the first IP and 1 from the other: the refused ones mailed nothing.
      expect(await verificationMails()).toHaveLength(11);
      expect(await prisma.authRateLimit.count()).toBe(2);
    });

    it('answers 403 SIGN_UP_CLOSED while no email can be sent, before any counter or write', async () => {
      const userId = await seedAccount(1, { pendingExpiresAt: at(DAY) });
      const before = await snapshot(userId);
      vi.spyOn(mail, 'canSend').mockReturnValue(false);

      const response = await resend({ email: 'member1@example.test' }).expect(
        403,
      );

      expect(response.body).toEqual({
        error: { code: 'SIGN_UP_CLOSED', message: SIGN_UP_CLOSED_MESSAGE },
      });
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(await snapshot(userId)).toEqual(before);
      expect(await verificationMails()).toEqual([]);
    });

    it('still answers 202 when the mail fails, and logs the user id only, never the address or the token', async () => {
      const userId = await seedAccount(1, { pendingExpiresAt: at(DAY) });
      vi.spyOn(mail, 'send').mockRejectedValueOnce(
        new Error('fake provider failure for member1@example.test'),
      );
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await resend({ email: 'member1@example.test' }).expect(202, {});
      await signUps.settle();

      expect(await prisma.authToken.count({ where: { userId } })).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = JSON.stringify(warn.mock.calls);
      expect(line).toContain(userId);
      expect(line).not.toContain('member1');
      expect(line).not.toContain('fake provider failure');
    });

    it('fails closed when the rate limiter cannot count: no 202, no token, no mail', async () => {
      const userId = await seedAccount(1, { pendingExpiresAt: at(DAY) });
      vi.spyOn(app.get(AuthRateLimiter), 'check').mockRejectedValueOnce(
        new Error('fake database outage'),
      );
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const response = await resend({ email: 'member1@example.test' });

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.text).not.toContain('member1');
      expect(await prisma.authToken.count({ where: { userId } })).toBe(0);
      expect(await verificationMails()).toEqual([]);
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing email', {}],
      ['a null email', { email: null }],
      ['a malformed email', { email: 'frieren.example.test' }],
      [
        'an email of 255 characters',
        { email: `${'a'.repeat(242)}@example.test` },
      ],
      [
        'a userId field (the account never comes from the body)',
        { email: SIGN_UP.email, userId: id(1) },
      ],
    ])(
      'answers 400 VALIDATION_FAILED to %s, before any counter',
      async (_, body) => {
        const response = await resend(body).expect(400);

        expect((response.body as ApiError).error.code).toBe(
          'VALIDATION_FAILED',
        );
        expect(response.text).not.toContain('frieren');
        expect(await prisma.authRateLimit.count()).toBe(0);
      },
    );

    it.each<[string, Record<string, string>, number, string]>([
      [
        'no X-Client-Ip',
        { 'X-Internal-Api-Key': FAKE_KEY },
        400,
        'BAD_REQUEST',
      ],
      ['a malformed X-Client-Ip', from('not-an-ip'), 400, 'BAD_REQUEST'],
      ['no internal key', { 'X-Client-Ip': IP }, 403, 'INTERNAL_KEY_REQUIRED'],
      [
        'the preview key',
        { ...WEB, 'X-Internal-Api-Key': FAKE_PREVIEW_KEY },
        403,
        'INTERNAL_KEY_REQUIRED',
      ],
    ])(
      'answers %s with %i, before any counter or mail',
      async (_, headers, status, code) => {
        await seedAccount(1, { pendingExpiresAt: at(DAY) });

        const response = await resend(
          { email: 'member1@example.test' },
          headers,
        ).expect(status);

        expect((response.body as ApiError).error.code).toBe(code);
        expect(await prisma.authRateLimit.count()).toBe(0);
        expect(await verificationMails()).toEqual([]);
      },
    );

    describe('races (each one forced by a held row lock or a held hash)', () => {
      /** Holds the account's row lock while `resends` resends queue on it, then runs `write` and commits. */
      async function whileResendsWait(
        userId: string,
        resends: number,
        write: (tx: TransactionClient) => Promise<void>,
      ): Promise<request.Response[]> {
        let started: Promise<request.Response>[] = [];
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM app_user WHERE id = ${userId}::uuid FOR UPDATE`;
            started = Array.from({ length: resends }, () =>
              resend({ email: SIGN_UP.email }).then((response) => response),
            );
            await waitForLockWaiter(resends);
            await write(tx);
          },
          { timeout: 10_000 },
        );
        return Promise.all(started);
      }

      it('confirm commits first: the resend finds a verified account, mails nothing and revives no token', async () => {
        const pending = await signUp();

        const [response] = await whileResendsWait(
          pending.userId,
          1,
          async (tx) => {
            await tx.$executeRaw`
            UPDATE auth_token SET used_at = ${NOW.toISOString()}::timestamptz
            WHERE user_id = ${pending.userId}::uuid`;
            await tx.$executeRaw`
            UPDATE app_user SET email_verified_at = ${NOW.toISOString()}::timestamptz,
              pending_expires_at = NULL WHERE id = ${pending.userId}::uuid`;
          },
        );

        expect(response?.status).toBe(202);
        expect(await verificationMails()).toHaveLength(1);
        expect(await tokenRows()).toEqual([
          expect.objectContaining({
            tokenHash: hexHash(pending.token),
            usedAt: NOW,
          }) as unknown,
        ]);
      });

      it('resend commits first: the confirm holding the old token gets 400 and verifies nothing; the new mail works', async () => {
        const pending = await signUp();
        const release = argon2.holdNext();
        const confirming = confirm({
          token: pending.token,
          password: PASSWORD,
        }).then((response) => response);
        await waitForDerives(2);

        await resend({ email: SIGN_UP.email }).expect(202, {});
        const newToken = await lastMailedToken();
        release();

        expect((await confirming).body).toEqual(TOKEN_INVALID);
        expect(
          await prisma.user.findUniqueOrThrow({
            where: { id: pending.userId },
          }),
        ).toMatchObject({ emailVerifiedAt: null });
        await confirm({
          token: newToken,
          bindingToken: pending.bindingToken,
        }).expect(200);
        expect(await prisma.session.count()).toBe(1);
      });

      it("re-submit commits first: the resend mails the re-armed account and keeps the re-submit's binding and deadline", async () => {
        const pending = await signUp();
        const deadline = at(DAY + 5 * HOUR);

        const [response] = await whileResendsWait(
          pending.userId,
          1,
          async (tx) => {
            await tx.$executeRaw`
            UPDATE app_user SET username = 'Fern', username_key = 'fern',
              password_hash = '$argon2id$fake-resubmit-hash',
              pending_expires_at = ${deadline.toISOString()}::timestamptz
            WHERE id = ${pending.userId}::uuid`;
            await tx.$executeRaw`
            UPDATE auth_token SET token_hash = ${hashAuthToken('fake-resubmit-token')},
              binding_hash = ${hashAuthToken('fake-resubmit-binding')},
              expires_at = ${deadline.toISOString()}::timestamptz
            WHERE user_id = ${pending.userId}::uuid`;
          },
        );

        expect(response?.status).toBe(202);
        const mails = await verificationMails();
        expect(mails.at(-1)).toMatchObject({
          to: SIGN_UP.email,
          username: 'Fern',
        });
        expect(await tokenRows()).toEqual([
          expect.objectContaining({
            tokenHash: hexHash(await lastMailedToken()),
            bindingHash: hexHash('fake-resubmit-binding'),
            expiresAt: deadline,
          }) as unknown,
        ]);
        expect(
          await prisma.user.findUniqueOrThrow({
            where: { id: pending.userId },
          }),
        ).toMatchObject({
          passwordHash: '$argon2id$fake-resubmit-hash',
          pendingExpiresAt: deadline,
        });
      });

      it('resend commits before a re-submit: sign-up then replaces token and binding together', async () => {
        const victim = await signUp();
        const release = argon2.holdNext();
        const resubmitting = request(app.getHttpServer())
          .post('/auth/sign-up')
          .set(from(ATTACKER_IP))
          .send({ ...SIGN_UP, username: 'Fern', password: ATTACKER_PASSWORD })
          .then((response) => response);
        await waitForDerives(2);

        await resend({ email: SIGN_UP.email }).expect(202, {});
        const resent = await lastMailedToken();
        release();
        const resubmit = await resubmitting;
        const attackerBinding = (resubmit.body as SignUpResponse).bindingToken;
        const latest = await lastMailedToken();

        expect(resubmit.status).toBe(202);
        expect(await tokenRows()).toEqual([
          expect.objectContaining({
            tokenHash: hexHash(latest),
            bindingHash: hexHash(attackerBinding),
          }) as unknown,
        ]);
        await confirm({
          token: resent,
          bindingToken: victim.bindingToken,
        }).expect(400, TOKEN_INVALID);
      });

      it('cleanup deletes the account first: the resend answers 202, mails nothing and inserts nothing', async () => {
        const pending = await signUp();

        const [response] = await whileResendsWait(
          pending.userId,
          1,
          async (tx) => {
            await tx.$executeRaw`DELETE FROM app_user WHERE id = ${pending.userId}::uuid`;
          },
        );

        expect(response?.status).toBe(202);
        expect(response?.body).toEqual({});
        expect(await verificationMails()).toHaveLength(1);
        expect(await prisma.authToken.count()).toBe(0);
      });

      it('two resends queued on one account: both 202, one row, only the later token works', async () => {
        const pending = await signUp();

        const responses = await whileResendsWait(pending.userId, 2, () =>
          Promise.resolve(),
        );

        expect(responses.map((response) => response.status)).toEqual([
          202, 202,
        ]);
        const tokens = (await verificationMails())
          .slice(1)
          .map((sent) => sent.token);
        expect(tokens).toHaveLength(2);
        const [row] = await prisma.authToken.findMany();
        expect(await prisma.authToken.count()).toBe(1);
        const live = tokens.filter(
          (token) => hexHash(token) === hex(row?.tokenHash ?? null),
        );
        const dead = tokens.filter((token) => !live.includes(token));
        expect(live).toHaveLength(1);
        await confirm({
          token: dead[0] ?? '',
          bindingToken: pending.bindingToken,
        }).expect(400, TOKEN_INVALID);
        await confirm({
          token: live[0] ?? '',
          bindingToken: pending.bindingToken,
        }).expect(200);
      });

      it('gives five 202s, no 500 and exactly one token row to five resends of one address at once', async () => {
        const pending = await signUp();
        const before = await snapshot(pending.userId);

        const responses = await Promise.all(
          Array.from({ length: 5 }, () => resend({ email: SIGN_UP.email })),
        );

        expect(responses.map((response) => response.status)).toEqual([
          202, 202, 202, 202, 202,
        ]);
        const after = await snapshot(pending.userId);
        expect(after.tokens).toHaveLength(1);
        expect(hex(after.tokens[0]?.bindingHash ?? null)).toBe(
          hex(before.tokens[0]?.bindingHash ?? null),
        );
        expect(after.user).toEqual(before.user);
      });
    });
  });
});
