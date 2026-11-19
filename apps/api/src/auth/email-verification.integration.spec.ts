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
import {
  AUTH_TOKEN_INVALID_MESSAGE,
  CONFIRM_LIMITED_MESSAGE,
  CONFIRM_PASSWORD_INVALID_MESSAGE,
} from './email-verification.controller';
import { PasswordHasher } from './password-hasher';
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

describe('POST /auth/email-verification/confirm', () => {
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
});
