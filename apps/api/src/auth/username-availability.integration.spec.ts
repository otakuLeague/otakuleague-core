import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type {
  ApiError,
  UsernameAvailabilityResponse,
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
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTestApp,
  FixedClock,
  SequentialRandom,
} from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { Argon2id, type Argon2idInput } from './argon2id';
import { AuthRateLimiter } from './auth-rate-limiter';
import { CLIENT_IP_REQUIRED_MESSAGE } from './credential.guard';
import { EmailSender } from './email-sender';
import { SignUpService } from './sign-up.service';
import { USERNAME_RULE_MESSAGE } from './sign-up-rules';
import { AVAILABILITY_LIMITED_MESSAGE } from './username-availability.controller';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// Obvious fakes: keys of 64 characters, documentation IPs (RFC 5737), example.test addresses.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const IP = '203.0.113.7';
const WEB = { 'X-Internal-Api-Key': FAKE_KEY, 'X-Client-Ip': IP };
const PASSWORD = 'fake password 1 for tests';

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

/** Fast stand-in that counts derivations. */
class CountingArgon2id extends Argon2id {
  derives = 0;

  derive(input: Argon2idInput): Promise<Buffer> {
    this.derives += 1;
    return Promise.resolve(
      createHash('shake256', { outputLength: input.tagLength })
        .update(input.password)
        .update(input.salt)
        .digest(),
    );
  }
}

/** `open` false is a deployment without a provider (sign-up closed). */
class SwitchableEmailSender extends EmailSender {
  open = true;

  canSend(): boolean {
    return this.open;
  }

  /** Drops the mail: this spec checks answers, sign-up's spec checks mails. */
  send(): Promise<void> {
    return Promise.resolve();
  }
}

const argon2 = new CountingArgon2id();
const mail = new SwitchableEmailSender();

/** The seven states of ADR 0020 Addendum (1e-iii) A1, each with sign-up's verdict on "Frieren". */
const STATES: readonly (readonly [
  string,
  boolean,
  (db: PrismaService) => Promise<unknown>,
])[] = [
  ['free', true, () => Promise.resolve()],
  ['verified', false, (db) => seedUser(db, { emailVerifiedAt: at(-DAY) })],
  ['pending', false, (db) => seedUser(db, { pendingExpiresAt: at(1) })],
  ['stale', true, (db) => seedUser(db, { pendingExpiresAt: NOW })],
  ['unverified with no deadline', false, (db) => seedUser(db, {})],
  ['a live hold', false, (db) => seedHold(db, at(1))],
  ['an ended hold', true, (db) => seedHold(db, NOW)],
];

function seedUser(
  db: PrismaService,
  state: { emailVerifiedAt?: Date; pendingExpiresAt?: Date },
): Promise<unknown> {
  return db.user.create({
    data: {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'member@example.test',
      username: 'FRIEREN',
      usernameKey: 'frieren',
      passwordHash: '$argon2id$fake-old-hash',
      createdAt: at(-2 * DAY),
      updatedAt: at(-2 * DAY),
      ...state,
    },
  });
}

function seedHold(db: PrismaService, expiresAt: Date): Promise<unknown> {
  return db.usernameHold.create({
    data: { usernameKey: 'frieren', expiresAt },
  });
}

describe('GET /users/availability', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let signUps: SignUpService;

  const check = (query: string, headers: Record<string, string> = WEB) =>
    request(app.getHttpServer())
      .get(`/users/availability${query}`)
      .set(headers);
  const signUp = (username: string, ip = IP) =>
    request(app.getHttpServer())
      .post('/auth/sign-up')
      .set({ ...WEB, 'X-Client-Ip': ip })
      .send({
        username,
        email: `${username}@example.test`,
        password: PASSWORD,
      });

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
    signUps = app.get(SignUpService);
  });

  beforeEach(async () => {
    await signUps.settle();
    await truncateAllTables(prisma);
    argon2.derives = 0;
    mail.open = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await signUps.settle();
    await app.close();
  });

  it.each(STATES)(
    'agrees with sign-up when the name is %s (A1): available %s exactly when sign-up does not answer 409',
    async (_, expected, seed) => {
      await seed(prisma);

      const response = await check('?username=frieren').expect(200);
      const submit = await signUp('Frieren', '198.51.100.9');

      expect(response.body).toEqual({ available: expected });
      expect([202, 409]).toContain(submit.status);
      expect(submit.status !== 409).toBe(expected);
    },
  );

  it('answers 200 { available } with no-store, counts one attempt and hashes nothing', async () => {
    const response = await check('?username=Frieren').expect(200);

    expect(response.body as UsernameAvailabilityResponse).toEqual({
      available: true,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await prisma.authRateLimit.count()).toBe(1);
    expect(argon2.derives).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.usernameHold.count()).toBe(0);
  });

  it('answers while sign-up is closed: it creates nothing', async () => {
    mail.open = false;

    await check('?username=Frieren').expect(200, { available: true });
  });

  it('refuses the 61st check of one IP in a minute, for a free and a taken name alike (brute force)', async () => {
    await seedHold(prisma, at(DAY));
    for (let n = 0; n < 60; n += 1) {
      await check(n % 2 === 0 ? '?username=Free' : '?username=frieren').expect(
        200,
      );
    }

    for (const name of ['Free', 'frieren']) {
      const refused = await check(`?username=${name}`).expect(429);
      expect(refused.body).toEqual({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: AVAILABILITY_LIMITED_MESSAGE,
        },
      });
      expect(refused.headers['retry-after']).toBe('60');
      expect(refused.headers['cache-control']).toBe('no-store');
    }
    // Per route: sign-up's own 5 per hour are untouched, and another IP still checks.
    await signUp('Other').expect(202);
    await check('?username=Free', {
      ...WEB,
      'X-Client-Ip': '198.51.100.9',
    }).expect(200);
  });

  it("never spends availability's counter on sign-up: five submits leave 60 checks", async () => {
    for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) {
      await signUp(name).expect(202);
    }
    await signUp('Six').expect(429);

    await check('?username=Free').expect(200, { available: true });
  });

  it.each([
    ['a missing username', ''],
    ['a username of 2 characters', '?username=ab'],
    ['a username of 21 characters', `?username=${'x'.repeat(21)}`],
    ['a username with "@"', '?username=frieren%40x'],
    ['a username with padding', '?username=%20Frieren%20'],
    ['a repeated username', '?username=Frieren&username=Himmel'],
    ['an unknown parameter', '?username=Frieren&userId=1'],
  ])(
    'answers 400 VALIDATION_FAILED to %s, before any counter',
    async (_, query) => {
      const response = await check(query).expect(400);

      expect((response.body as ApiError).error.code).toBe('VALIDATION_FAILED');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(await prisma.authRateLimit.count()).toBe(0);
    },
  );

  it("gives a malformed name sign-up's message, never echoing the value", async () => {
    const response = await check('?username=secret%40name').expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'username', message: USERNAME_RULE_MESSAGE }],
      },
    });
    expect(response.text).not.toContain('secret');
  });

  it.each<[string, Record<string, string>]>([
    ['no X-Client-Ip', { 'X-Internal-Api-Key': FAKE_KEY }],
    ['a malformed X-Client-Ip', { ...WEB, 'X-Client-Ip': 'not-an-ip' }],
  ])(
    'answers 400 BAD_REQUEST to %s, before any counter',
    async (_, headers) => {
      const response = await check('?username=Frieren', headers).expect(400);

      expect(response.body).toEqual({
        error: { code: 'BAD_REQUEST', message: CLIENT_IP_REQUIRED_MESSAGE },
      });
      expect(await prisma.authRateLimit.count()).toBe(0);
    },
  );

  it.each<[string, Record<string, string>]>([
    [
      'the preview key, although this is a GET',
      { ...WEB, 'X-Internal-Api-Key': FAKE_PREVIEW_KEY },
    ],
    ['no internal key', { 'X-Client-Ip': IP }],
    ['a wrong internal key', { ...WEB, 'X-Internal-Api-Key': 'x'.repeat(64) }],
  ])('answers 403 to %s, before any counter', async (_, headers) => {
    const response = await check('?username=Frieren', headers).expect(403);

    expect((response.body as ApiError).error.code).toBe(
      'INTERNAL_KEY_REQUIRED',
    );
    expect(await prisma.authRateLimit.count()).toBe(0);
  });

  it('answers 503 when the counter cannot count: never an uncounted pass', async () => {
    vi.spyOn(app.get(AuthRateLimiter), 'check').mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fake: database unreachable', {
        code: 'P1001',
        clientVersion: 'test',
      }),
    );

    const response = await check('?username=Frieren').expect(503);

    expect((response.body as ApiError).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.text).not.toContain('available');
  });
});
