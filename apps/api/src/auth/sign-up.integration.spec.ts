import { createHash } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import type {
  ApiError,
  SignUpRequest,
  SignUpResponse,
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
import {
  SIGN_UP_LIMITED_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
} from './auth.controller';
import { CLIENT_IP_REQUIRED_MESSAGE } from './credential.guard';
import { type AuthEmail, EmailSender } from './email-sender';
import { PasswordHasher } from './password-hasher';
import { SESSION_TOKEN_PATTERN } from './session-rules';
import { SignUpService } from './sign-up.service';
import { hashAuthToken, SIGN_UP_CLOSED_MESSAGE } from './sign-up-rules';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Obvious fakes: keys of 64 characters, documentation IPs (RFC 5737), example.test addresses.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.9';
const WEB = { 'X-Internal-Api-Key': FAKE_KEY, 'X-Client-Ip': IP };
const PASSWORD = 'fake password 1 for tests';
const SIGN_UP: SignUpRequest = {
  username: 'Frieren',
  email: 'frieren@example.test',
  password: PASSWORD,
};
const USERNAME_TAKEN = {
  error: { code: 'USERNAME_TAKEN', message: USERNAME_TAKEN_MESSAGE },
};
const OLD_HASH = '$argon2id$fake-old-hash';

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
/** Outside SequentialRandom's ids (variant 8), so a seeded row never collides with a new one. */
const id = (n: number): string =>
  `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const digest = (fill: number): Uint8Array<ArrayBuffer> =>
  new Uint8Array(32).fill(fill);
const bytes = (value: Uint8Array | null): Buffer =>
  Buffer.from(value ?? new Uint8Array());

/** Fast stand-in that counts derivations; while `gate` is set, each one waits for it. */
class GatedArgon2id extends Argon2id {
  derives = 0;
  gate: Promise<void> | null = null;

  async derive(input: Argon2idInput): Promise<Buffer> {
    this.derives += 1;
    if (this.gate !== null) await this.gate;
    return createHash('shake256', { outputLength: input.tagLength })
      .update(input.password)
      .update(input.salt)
      .digest();
  }
}

/** Keeps every email; `open` false is a deployment without a provider, `failing` a provider error. */
class RecordingEmailSender extends EmailSender {
  readonly sent: AuthEmail[] = [];
  open = true;
  failing = false;

  canSend(): boolean {
    return this.open;
  }

  send(email: AuthEmail): Promise<void> {
    this.sent.push(email);
    return this.failing
      ? Promise.reject(new Error(`fake send failure for ${email.to}`))
      : Promise.resolve();
  }
}

const argon2 = new GatedArgon2id();
const mail = new RecordingEmailSender();

describe('POST /auth/sign-up', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasher;
  let signUps: SignUpService;

  const signUp = (body: object, headers: Record<string, string> = WEB) =>
    request(app.getHttpServer()).post('/auth/sign-up').set(headers).send(body);
  const from = (ip: string): Record<string, string> => ({
    ...WEB,
    'X-Client-Ip': ip,
  });

  async function seedUser(
    n: number,
    account: {
      readonly username: string;
      readonly email?: string;
      readonly verified: boolean;
      readonly pendingExpiresAt: Date | null;
    },
  ): Promise<string> {
    const userId = id(n);
    await prisma.user.create({
      data: {
        id: userId,
        email: account.email ?? `member${n}@example.test`,
        username: account.username,
        usernameKey: account.username.toLowerCase(),
        passwordHash: OLD_HASH,
        emailVerifiedAt: account.verified ? at(-DAY) : null,
        pendingExpiresAt: account.pendingExpiresAt,
        createdAt: at(-2 * DAY),
        updatedAt: at(-2 * DAY),
      },
    });
    return userId;
  }

  async function seedToken(fill: number, userId: string): Promise<void> {
    await prisma.authToken.create({
      data: {
        tokenHash: digest(fill),
        purpose: 'EMAIL_VERIFICATION',
        userId,
        bindingHash: digest(fill + 1),
        createdAt: at(-DAY),
        expiresAt: at(HOUR),
      },
    });
  }

  /** Every hash waits until the returned function is called. */
  function closeGate(): () => void {
    let release: () => void = () => undefined;
    argon2.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => release();
  }

  async function waitForDerives(count: number): Promise<void> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (argon2.derives >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Only ${argon2.derives} of ${count} hashes started`);
  }

  async function sentAfterSettling(): Promise<AuthEmail[]> {
    await signUps.settle();
    return mail.sent;
  }

  function verificationToken(email: AuthEmail | undefined): string {
    if (email?.kind !== 'email_verification') {
      throw new Error('No verification email was sent');
    }
    return email.token;
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
    argon2.gate = null;
    mail.sent.splice(0);
    mail.open = true;
    mail.failing = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a pending account, holds the username and mails a token apart from the binding', async () => {
    const response = await signUp({
      ...SIGN_UP,
      email: '  FRIEREN@Example.TEST ',
    }).expect(202);

    const body = response.body as SignUpResponse;
    expect(Object.keys(body)).toEqual(['bindingToken']);
    expect(body.bindingToken).toMatch(SESSION_TOKEN_PATTERN);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(argon2.derives).toBe(1);
    const sent = await sentAfterSettling();
    expect(sent).toEqual([
      {
        kind: 'email_verification',
        to: 'frieren@example.test',
        username: 'Frieren',
        token: expect.stringMatching(SESSION_TOKEN_PATTERN) as string,
      },
    ]);
    const token = verificationToken(sent[0]);
    expect(token).not.toBe(body.bindingToken);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'frieren@example.test' },
    });
    expect(user).toMatchObject({
      username: 'Frieren',
      usernameKey: 'frieren',
      emailVerifiedAt: null,
      pendingExpiresAt: at(DAY),
      sessionEpoch: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const tokens = await prisma.authToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      purpose: 'EMAIL_VERIFICATION',
      userId: user.id,
      createdAt: NOW,
      expiresAt: at(DAY),
      usedAt: null,
    });
    expect(bytes(tokens[0]?.tokenHash ?? null)).toEqual(
      bytes(hashAuthToken(token)),
    );
    expect(bytes(tokens[0]?.bindingHash ?? null)).toEqual(
      bytes(hashAuthToken(body.bindingToken)),
    );
    expect(await prisma.usernameHold.findMany()).toEqual([
      { usernameKey: 'frieren', expiresAt: at(DAY) },
    ]);
    expect(await prisma.authRateLimit.count()).toBe(1);
    expect(await hasher.verify(PASSWORD, user.passwordHash)).toBe('match');
  });

  it('gives no session: the pending account cannot sign in before verification', async () => {
    await signUp(SIGN_UP).expect(202);

    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set(WEB)
      .send({ identifier: SIGN_UP.email, password: PASSWORD })
      .expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('answers a new, a pending and a registered email alike: same status, headers, length and one hash each', async () => {
    await seedUser(1, {
      username: 'Pending',
      email: 'pending@example.test',
      verified: false,
      pendingExpiresAt: at(HOUR),
    });
    await seedUser(2, {
      username: 'Himmel',
      email: 'himmel@example.test',
      verified: true,
      pendingExpiresAt: null,
    });

    const responses: request.Response[] = [];
    for (const [username, email] of [
      ['NewOne', 'new@example.test'],
      ['NewTwo', 'pending@example.test'],
      ['NewThree', 'himmel@example.test'],
    ] as const) {
      responses.push(
        await signUp({ username, email, password: PASSWORD }).expect(202),
      );
    }

    const shapes = responses.map((response) => ({
      length: response.text.length,
      cacheControl: response.headers['cache-control'],
      keys: Object.keys(response.body as object),
    }));
    expect(new Set(shapes.map((shape) => JSON.stringify(shape))).size).toBe(1);
    expect(argon2.derives).toBe(3);
  });

  it('never changes a registered account: its owner gets a notice and the username stays held', async () => {
    const owner = await seedUser(1, {
      username: 'Himmel',
      email: 'himmel@example.test',
      verified: true,
      pendingExpiresAt: null,
    });
    await seedToken(7, owner);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: owner },
    });

    await signUp({ ...SIGN_UP, email: 'HIMMEL@example.test' }).expect(202);

    expect(argon2.derives).toBe(1);
    expect(await prisma.user.findMany()).toEqual([before]);
    const tokens = await prisma.authToken.findMany();
    expect(tokens.map((token) => bytes(token.tokenHash))).toEqual([
      bytes(digest(7)),
    ]);
    expect(await sentAfterSettling()).toEqual([
      { kind: 'sign_up_notice', to: 'himmel@example.test' },
    ]);
    expect(await prisma.usernameHold.findMany()).toEqual([
      { usernameKey: 'frieren', expiresAt: at(DAY) },
    ]);
  });

  it('never changes an unverified account with no deadline (from before slice 1e): a notice, the hold kept', async () => {
    const owner = await seedUser(1, {
      username: 'Himmel',
      email: 'himmel@example.test',
      verified: false,
      pendingExpiresAt: null,
    });
    await seedToken(7, owner);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: owner },
    });

    await signUp({ ...SIGN_UP, email: 'himmel@example.test' }).expect(202);

    expect(argon2.derives).toBe(1);
    expect(await prisma.user.findMany()).toEqual([before]);
    expect(await prisma.authToken.count()).toBe(1);
    expect(await sentAfterSettling()).toEqual([
      { kind: 'sign_up_notice', to: 'himmel@example.test' },
    ]);
    expect(await prisma.usernameHold.findMany()).toEqual([
      { usernameKey: 'frieren', expiresAt: at(DAY) },
    ]);
  });

  it.each([
    ['pending', at(HOUR)],
    ['stale (past its deadline)', NOW],
  ])(
    're-arms a %s account of the same email in place and replaces its token',
    async (_, deadline) => {
      const userId = await seedUser(1, {
        username: 'OldName',
        email: SIGN_UP.email,
        verified: false,
        pendingExpiresAt: deadline,
      });
      await seedToken(7, userId);
      // Used: the upsert must revive the one row, never leave the new token consumed.
      await prisma.authToken.update({
        where: { tokenHash: digest(7) },
        data: { usedAt: at(-HOUR) },
      });

      const response = await signUp(SIGN_UP).expect(202);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user).toMatchObject({
        username: 'Frieren',
        usernameKey: 'frieren',
        emailVerifiedAt: null,
        pendingExpiresAt: at(DAY),
        createdAt: at(-2 * DAY),
        updatedAt: NOW,
      });
      expect(await prisma.user.count()).toBe(1);
      const token = verificationToken((await sentAfterSettling())[0]);
      const tokens = await prisma.authToken.findMany();
      expect(tokens.map((row) => bytes(row.tokenHash))).toEqual([
        bytes(hashAuthToken(token)),
      ]);
      expect(bytes(tokens[0]?.bindingHash ?? null)).toEqual(
        bytes(hashAuthToken((response.body as SignUpResponse).bindingToken)),
      );
      expect(tokens[0]).toMatchObject({
        purpose: 'EMAIL_VERIFICATION',
        userId,
        createdAt: NOW,
        expiresAt: at(DAY),
        usedAt: null,
      });
      expect(await hasher.verify(PASSWORD, user.passwordHash)).toBe('match');
    },
  );

  it('replaces a stale account holding the username, whatever its email; its tokens go too', async () => {
    const stale = await seedUser(1, {
      username: 'frieren',
      email: 'old@example.test',
      verified: false,
      pendingExpiresAt: NOW,
    });
    await seedToken(7, stale);

    await signUp(SIGN_UP).expect(202);

    const users = await prisma.user.findMany();
    expect(users.map((user) => [user.email, user.usernameKey])).toEqual([
      [SIGN_UP.email, 'frieren'],
    ]);
    expect(users[0]?.id).not.toBe(stale);
    const tokens = await prisma.authToken.findMany();
    expect(tokens.map((token) => token.userId)).toEqual([users[0]?.id]);
  });

  it('claims a hold that has ended', async () => {
    await prisma.usernameHold.create({
      data: { usernameKey: 'frieren', expiresAt: NOW },
    });

    await signUp(SIGN_UP).expect(202);

    expect(await prisma.usernameHold.findMany()).toEqual([
      { usernameKey: 'frieren', expiresAt: at(DAY) },
    ]);
  });

  it.each<[string, (prisma: PrismaService) => Promise<unknown>]>([
    [
      'a verified member, in another letter case',
      (db) =>
        db.user.create({
          data: {
            id: id(1),
            email: 'member@example.test',
            username: 'FRIEREN',
            usernameKey: 'frieren',
            passwordHash: OLD_HASH,
            emailVerifiedAt: at(-DAY),
            createdAt: at(-DAY),
            updatedAt: at(-DAY),
          },
        }),
    ],
    [
      'a pending sign-up of another email',
      (db) =>
        db.user.create({
          data: {
            id: id(1),
            email: 'member@example.test',
            username: 'Frieren',
            usernameKey: 'frieren',
            passwordHash: OLD_HASH,
            pendingExpiresAt: at(1),
            createdAt: at(-DAY),
            updatedAt: at(-DAY),
          },
        }),
    ],
    [
      'an unverified account with no deadline (from before slice 1e)',
      (db) =>
        db.user.create({
          data: {
            id: id(1),
            email: 'member@example.test',
            username: 'Frieren',
            usernameKey: 'frieren',
            passwordHash: OLD_HASH,
            createdAt: at(-DAY),
            updatedAt: at(-DAY),
          },
        }),
    ],
    [
      'a live hold, 1 ms from its end',
      (db) =>
        db.usernameHold.create({
          data: { usernameKey: 'frieren', expiresAt: at(1) },
        }),
    ],
  ])(
    'answers 409 USERNAME_TAKEN to a username held by %s, without a hash, a write or a mail',
    async (_, seed) => {
      await seed(prisma);
      const users = await prisma.user.findMany();
      const holds = await prisma.usernameHold.findMany();

      const response = await signUp(SIGN_UP).expect(409);

      expect(response.body).toEqual(USERNAME_TAKEN);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(argon2.derives).toBe(0);
      expect(await prisma.user.findMany()).toEqual(users);
      expect(await prisma.usernameHold.findMany()).toEqual(holds);
      expect(await prisma.authToken.count()).toBe(0);
      expect(await sentAfterSettling()).toEqual([]);
    },
  );

  it('answers 409 to the same form sent again (a replay), without a second hash', async () => {
    await signUp(SIGN_UP).expect(202);

    const response = await signUp(SIGN_UP).expect(409);

    expect(response.body).toEqual(USERNAME_TAKEN);
    expect(argon2.derives).toBe(1);
    expect(await prisma.authToken.count()).toBe(1);
    expect(await sentAfterSettling()).toHaveLength(1);
  });

  it('rolls the claimed hold back when an account takes the username during the hash', async () => {
    const release = closeGate();
    const pending = signUp(SIGN_UP).then((response) => response);
    await waitForDerives(1);
    await seedUser(1, {
      username: 'FRIEREN',
      verified: true,
      pendingExpiresAt: null,
    });
    release();

    const response = await pending;

    expect(response.status).toBe(409);
    expect(response.body).toEqual(USERNAME_TAKEN);
    expect(await prisma.usernameHold.count()).toBe(0);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authToken.count()).toBe(0);
    expect(await sentAfterSettling()).toEqual([]);
  });

  it('gives one 202 and one 409 to two submits of one username that both passed the read', async () => {
    const release = closeGate();
    const racing = Promise.all([
      signUp({ ...SIGN_UP, email: 'one@example.test' }, from(IP)),
      signUp(
        { ...SIGN_UP, username: 'FRIEREN', email: 'two@example.test' },
        from(OTHER_IP),
      ),
    ]);
    await waitForDerives(2);
    release();

    const statuses = (await racing).map((response) => response.status);

    expect(statuses.sort((a, b) => a - b)).toEqual([202, 409]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.usernameHold.count()).toBe(1);
    expect(await prisma.authToken.count()).toBe(1);
  });

  it('leaves one account and one token when two submits of one email race', async () => {
    const release = closeGate();
    const racing = Promise.all([
      signUp(SIGN_UP, from(IP)),
      signUp({ ...SIGN_UP, username: 'Himmel' }, from(OTHER_IP)),
    ]);
    await waitForDerives(2);
    release();

    const responses = await racing;

    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    const tokens = await prisma.authToken.findMany();
    expect(tokens.map((token) => token.userId)).toEqual([users[0]?.id]);
    const bindings = responses.map((response) =>
      bytes(hashAuthToken((response.body as SignUpResponse).bindingToken)),
    );
    expect(bindings).toContainEqual(bytes(tokens[0]?.bindingHash ?? null));
    expect(await prisma.usernameHold.count()).toBe(2);
  });

  it('gives exactly one 202 and no 500 to a burst of five submits of one username', async () => {
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        signUp(
          { ...SIGN_UP, email: `member${n}@example.test` },
          from(`203.0.113.${n}`),
        ),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.sort((a, b) => a - b)).toEqual([202, 409, 409, 409, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it('refuses the 6th submit from one IP in an hour without hashing (brute force); another IP still signs up', async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      await signUp({
        username: `Member${n}`,
        email: `member${n}@example.test`,
        password: PASSWORD,
      }).expect(202);
    }

    const refused = await signUp(SIGN_UP).expect(429);

    expect(refused.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: SIGN_UP_LIMITED_MESSAGE },
    });
    expect(refused.headers['retry-after']).toBe('3600');
    expect(argon2.derives).toBe(5);
    expect(await prisma.usernameHold.count()).toBe(5);
    await signUp(SIGN_UP, from(OTHER_IP)).expect(202);
  });

  it('answers 403 SIGN_UP_CLOSED and writes nothing while no email can be sent (ADR 0020 N5)', async () => {
    mail.open = false;

    const response = await signUp(SIGN_UP).expect(403);

    expect(response.body).toEqual({
      error: { code: 'SIGN_UP_CLOSED', message: SIGN_UP_CLOSED_MESSAGE },
    });
    expect(await prisma.authRateLimit.count()).toBe(0);
    expect(argon2.derives).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.usernameHold.count()).toBe(0);
    expect(await sentAfterSettling()).toEqual([]);
  });

  it('still answers 202 when the mail fails, and logs the user id only', async () => {
    mail.failing = true;
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const response = await signUp(SIGN_UP).expect(202);

    const sent = await sentAfterSettling();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: SIGN_UP.email },
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Sending the email_verification email to user ${user.id} failed; not retried.`,
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(SIGN_UP.email);
    expect(logged).not.toContain(verificationToken(sent[0]));
    expect(logged).not.toContain(
      (response.body as SignUpResponse).bindingToken,
    );
  });

  it('still answers 202 when the notice to a registered owner fails, and logs no address', async () => {
    await seedUser(1, {
      username: 'Himmel',
      email: 'himmel@example.test',
      verified: true,
      pendingExpiresAt: null,
    });
    mail.failing = true;
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await signUp({ ...SIGN_UP, email: 'himmel@example.test' }).expect(202);

    expect(await sentAfterSettling()).toEqual([
      { kind: 'sign_up_notice', to: 'himmel@example.test' },
    ]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Sending the sign_up_notice email to a registered account failed; not retried.',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('himmel@');
  });

  it.each<[string, Record<string, string>]>([
    ['no X-Client-Ip', { 'X-Internal-Api-Key': FAKE_KEY }],
    ['a malformed X-Client-Ip', from('not-an-ip')],
    ['a list of IPs', from(`${IP}, ${OTHER_IP}`)],
  ])('answers 400 to %s, before any counter or hash', async (_, headers) => {
    const response = await signUp(SIGN_UP, headers).expect(400);

    expect(response.body).toEqual({
      error: { code: 'BAD_REQUEST', message: CLIENT_IP_REQUIRED_MESSAGE },
    });
    expect(await prisma.authRateLimit.count()).toBe(0);
    expect(argon2.derives).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it.each<[string, Record<string, string>]>([
    ['the preview key', { ...WEB, 'X-Internal-Api-Key': FAKE_PREVIEW_KEY }],
    ['no internal key', { 'X-Client-Ip': IP }],
    ['a wrong internal key', { ...WEB, 'X-Internal-Api-Key': 'x'.repeat(64) }],
  ])('answers 403 to %s, before any counter or hash', async (_, headers) => {
    const response = await signUp(SIGN_UP, headers).expect(403);

    expect((response.body as ApiError).error.code).toBe(
      'INTERNAL_KEY_REQUIRED',
    );
    expect(await prisma.authRateLimit.count()).toBe(0);
    expect(argon2.derives).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a username with "@"', { ...SIGN_UP, username: 'frieren@x' }],
    ['a username of 2 characters', { ...SIGN_UP, username: 'ab' }],
    ['a password of 7 characters', { ...SIGN_UP, password: 'abcde1!' }],
    [
      'a password without a digit or symbol',
      { ...SIGN_UP, password: 'abcdefghijkl' },
    ],
    ['a password of 129 characters', { ...SIGN_UP, password: '1'.repeat(129) }],
    ['a non-ASCII email', { ...SIGN_UP, email: 'frierén@example.test' }],
    [
      'an email of 255 characters',
      { ...SIGN_UP, email: `${'a'.repeat(242)}@example.test` },
    ],
    ['a missing password', { username: 'Frieren', email: SIGN_UP.email }],
    [
      'a userId field (the member never comes from the body)',
      { ...SIGN_UP, userId: id(1) },
    ],
    [
      'an emailVerifiedAt field',
      { ...SIGN_UP, emailVerifiedAt: NOW.toISOString() },
    ],
  ])(
    'answers 400 VALIDATION_FAILED to %s, before any counter or hash',
    async (_, body) => {
      const response = await signUp(body).expect(400);

      expect((response.body as ApiError).error.code).toBe('VALIDATION_FAILED');
      expect(response.text).not.toContain(PASSWORD);
      expect(response.text).not.toContain('abcdefghijkl');
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(argon2.derives).toBe(0);
      expect(await prisma.user.count()).toBe(0);
    },
  );
});
