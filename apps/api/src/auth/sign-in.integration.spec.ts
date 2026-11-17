import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type {
  ApiError,
  SignInRequest,
  SignInResponse,
} from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type InternalKeyCheck,
  InternalKeySettings,
} from '../common/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTestApp,
  FixedClock,
  SequentialRandom,
} from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { Argon2id, type Argon2idInput } from './argon2id';
import {
  INVALID_CREDENTIALS_MESSAGE,
  SIGN_IN_LIMITED_MESSAGE,
} from './auth.controller';
import { CLIENT_IP_REQUIRED_MESSAGE } from './credential.guard';
import { PasswordHasher } from './password-hasher';
import { SESSION_REQUIRED_MESSAGE } from './session.guard';
import { hashSessionToken, SESSION_TOKEN_PATTERN } from './session-rules';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// Obvious fakes: keys of 64 characters, documentation IPs (RFC 5737), example.test addresses.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const FAKE_TOKEN = 'fake-session-token-'.padEnd(43, 'A');
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.9';
const WEB = { 'X-Internal-Api-Key': FAKE_KEY, 'X-Client-Ip': IP };
const PASSWORD = 'fake password for tests 1';
const WRONG_PASSWORD = 'fake wrong password 2';
// 128 code points once NFC composes each "e" + U+0301 (256 before): at the bound, not over it.
const COMPOSED_128 = 'é'.repeat(128);
const DECOMPOSED_128 = 'é'.repeat(128);
const MEMBER = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'frieren@example.test',
  username: 'Frieren',
  sessionEpoch: 3,
} as const;
const INVALID_CREDENTIALS_TEXT = JSON.stringify({
  error: { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE },
});
const UNAUTHORIZED = {
  error: { code: 'UNAUTHORIZED', message: SESSION_REQUIRED_MESSAGE },
};
const INTERNAL_KEY_REQUIRED = 'INTERNAL_KEY_REQUIRED';

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

/** Fast stand-in that counts derivations: one per verification, dummy ones included. */
class CountingArgon2id extends Argon2id {
  derives = 0;

  derive(input: Argon2idInput): Promise<Buffer> {
    this.derives += 1;
    const { memoryKiB, passes, parallelism, tagLength } = input;
    return Promise.resolve(
      createHash('shake256', { outputLength: tagLength })
        .update(input.password)
        .update(input.salt)
        .update(`${memoryKiB},${passes},${parallelism}`)
        .digest(),
    );
  }
}

const argon2 = new CountingArgon2id();

function appWith(check: InternalKeyCheck): Promise<INestApplication<App>> {
  return createTestApp({
    clock: new FixedClock(NOW),
    random: new SequentialRandom(),
    overrides: [
      { provide: InternalKeySettings, useValue: { get: () => check } },
      { provide: Argon2id, useValue: argon2 },
    ],
  });
}

describe('POST /auth/sign-in and POST /auth/sign-out', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let memberHash: string;
  let accentHash: string;

  const signIn = (body: object, headers: Record<string, string> = WEB) =>
    request(app.getHttpServer()).post('/auth/sign-in').set(headers).send(body);
  const signOut = (token: string) =>
    request(app.getHttpServer())
      .post('/auth/sign-out')
      .set({
        'X-Internal-Api-Key': FAKE_KEY,
        Authorization: `Bearer ${token}`,
      });
  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/me')
      .set({
        'X-Internal-Api-Key': FAKE_KEY,
        Authorization: `Bearer ${token}`,
      });
  const tokenOf = async (body: SignInRequest): Promise<string> => {
    const response = await signIn(body).expect(200);
    return (response.body as SignInResponse).sessionToken;
  };

  async function seedMember(
    options: { verified?: boolean; passwordHash?: string } = {},
  ): Promise<void> {
    await prisma.user.create({
      data: {
        id: MEMBER.id,
        email: MEMBER.email,
        username: MEMBER.username,
        usernameKey: MEMBER.username.toLowerCase(),
        passwordHash: options.passwordHash ?? memberHash,
        emailVerifiedAt: options.verified === false ? null : at(-DAY),
        sessionEpoch: MEMBER.sessionEpoch,
        createdAt: at(-2 * DAY),
        updatedAt: at(-2 * DAY),
      },
    });
  }

  beforeAll(async () => {
    app = await appWith({
      kind: 'enforced',
      acceptedKeys: [FAKE_KEY],
      previewKey: FAKE_PREVIEW_KEY,
    });
    prisma = app.get(PrismaService);
    const hasher = app.get(PasswordHasher);
    memberHash = await hasher.hash(PASSWORD);
    accentHash = await hasher.hash(COMPOSED_128);
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
    argon2.derives = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs in by email in any case and padding, on the member epoch, never cached', async () => {
    await seedMember();

    const response = await signIn({
      identifier: '  FRIEREN@Example.TEST ',
      password: PASSWORD,
    }).expect(200);

    const body = response.body as SignInResponse;
    expect(body.sessionToken).toMatch(SESSION_TOKEN_PATTERN);
    expect(body).toEqual({
      sessionToken: body.sessionToken,
      expiresAt: at(30 * DAY).toISOString(),
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(argon2.derives).toBe(1);
    const stored = await prisma.session.findFirstOrThrow({
      where: { userId: MEMBER.id },
    });
    expect(stored).toMatchObject({
      sessionEpoch: MEMBER.sessionEpoch,
      createdAt: NOW,
      expiresAt: at(30 * DAY),
    });
    expect(Buffer.from(stored.tokenHash)).toEqual(
      Buffer.from(hashSessionToken(body.sessionToken)),
    );
    await me(body.sessionToken).expect(200, {
      id: MEMBER.id,
      username: MEMBER.username,
    });
  });

  it('signs in by username in any case and padding', async () => {
    await seedMember();

    const token = await tokenOf({
      identifier: ' fRIEREN ',
      password: PASSWORD,
    });

    await me(token).expect(200, { id: MEMBER.id, username: MEMBER.username });
    expect(argon2.derives).toBe(1);
  });

  it('accepts an identifier of 254 characters (a 401, not a 400)', async () => {
    await seedMember();

    const response = await signIn({
      identifier: `${'a'.repeat(241)}@example.test`,
      password: PASSWORD,
    }).expect(401);

    expect(response.text).toBe(INVALID_CREDENTIALS_TEXT);
    expect(argon2.derives).toBe(1);
  });

  it('counts 128 characters after NFC, and matches either spelling of an accent', async () => {
    await seedMember({ passwordHash: accentHash });

    await signIn({ identifier: MEMBER.email, password: DECOMPOSED_128 }).expect(
      200,
    );
    expect(argon2.derives).toBe(1);
  });

  it.each<[string, boolean, SignInRequest]>([
    [
      'a wrong password',
      true,
      { identifier: MEMBER.email, password: WRONG_PASSWORD },
    ],
    [
      'an unknown email',
      true,
      { identifier: 'nobody@example.test', password: PASSWORD },
    ],
    ['an unknown username', true, { identifier: 'nobody', password: PASSWORD }],
    [
      'an unverified email with the right password',
      false,
      { identifier: MEMBER.email, password: PASSWORD },
    ],
  ])(
    'answers the one 401 INVALID_CREDENTIALS to %s, after exactly one verification',
    async (_, verified, body) => {
      await seedMember({ verified });

      const response = await signIn(body).expect(401);

      expect(response.text).toBe(INVALID_CREDENTIALS_TEXT);
      expect(argon2.derives).toBe(1);
      expect(await prisma.session.count()).toBe(0);
    },
  );

  it('counts a success too and refuses the 6th attempt per (identifier, IP) without verifying', async () => {
    await seedMember();
    const attempt = { identifier: MEMBER.email, password: PASSWORD };
    for (let count = 0; count < 4; count += 1) {
      await signIn({ ...attempt, password: WRONG_PASSWORD }).expect(401);
    }
    await signIn(attempt).expect(200);

    const response = await signIn(attempt).expect(429);

    expect(response.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: SIGN_IN_LIMITED_MESSAGE },
    });
    expect(response.headers['retry-after']).toBe('900');
    expect(argon2.derives).toBe(5);
    // The pair is locked, not the member: another IP still signs in.
    await signIn(attempt, { ...WEB, 'X-Client-Ip': OTHER_IP }).expect(200);
  });

  it('counts an unknown identifier like a real one', async () => {
    const attempt = { identifier: 'nobody@example.test', password: PASSWORD };
    for (let count = 0; count < 5; count += 1) {
      await signIn(attempt).expect(401);
    }

    const response = await signIn(attempt).expect(429);

    expect(response.headers['retry-after']).toBe('900');
    expect(argon2.derives).toBe(5);
  });

  it('refuses the 31st attempt from one IP across identifiers without verifying', async () => {
    for (let count = 0; count < 30; count += 1) {
      await signIn({
        identifier: `guess${count}@example.test`,
        password: PASSWORD,
      }).expect(401);
    }

    await signIn({ identifier: 'guess@example.test', password: PASSWORD })
      .expect(429)
      .expect('Retry-After', '900');
    expect(argon2.derives).toBe(30);
  });

  it.each<[string, Record<string, string>]>([
    ['no X-Client-Ip', { 'X-Internal-Api-Key': FAKE_KEY }],
    ['a malformed X-Client-Ip', { ...WEB, 'X-Client-Ip': 'not-an-ip' }],
    ['a list of IPs', { ...WEB, 'X-Client-Ip': `${IP}, ${OTHER_IP}` }],
  ])(
    'answers 400 to %s, before any counter or verification',
    async (_, headers) => {
      await seedMember();

      const response = await signIn(
        { identifier: MEMBER.email, password: PASSWORD },
        headers,
      ).expect(400);

      expect(response.body).toEqual({
        error: { code: 'BAD_REQUEST', message: CLIENT_IP_REQUIRED_MESSAGE },
      });
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(argon2.derives).toBe(0);
    },
  );

  it.each<[string, Record<string, string>]>([
    ['the preview key', { ...WEB, 'X-Internal-Api-Key': FAKE_PREVIEW_KEY }],
    ['no internal key', { 'X-Client-Ip': IP }],
  ])(
    'answers 403 to %s, before any counter or verification',
    async (_, headers) => {
      await seedMember();

      const response = await signIn(
        { identifier: MEMBER.email, password: PASSWORD },
        headers,
      ).expect(403);

      expect((response.body as ApiError).error.code).toBe(
        INTERNAL_KEY_REQUIRED,
      );
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(argon2.derives).toBe(0);
    },
  );

  it.each<[string, Record<string, unknown>]>([
    [
      'a password of 129 characters',
      { identifier: MEMBER.email, password: 'a'.repeat(129) },
    ],
    [
      'an identifier of 255 characters',
      { identifier: `${'a'.repeat(242)}@example.test`, password: PASSWORD },
    ],
    [
      'a raw password of combining marks over 1024 UTF-16 units',
      { identifier: MEMBER.email, password: `a${'\u0301'.repeat(2000)}` },
    ],
    ['a whitespace-only identifier', { identifier: '   ', password: PASSWORD }],
    ['a non-string password', { identifier: MEMBER.email, password: 12345678 }],
    ['an empty password', { identifier: MEMBER.email, password: '' }],
    ['a missing identifier', { password: PASSWORD }],
    [
      'NUL in the identifier',
      { identifier: 'frieren\u0000', password: PASSWORD },
    ],
    [
      'a userId field (the member never comes from the body)',
      { identifier: MEMBER.email, password: PASSWORD, userId: MEMBER.id },
    ],
  ])(
    'answers 400 VALIDATION_FAILED to %s, before any counter or verification',
    async (_, body) => {
      await seedMember();

      const response = await signIn(body).expect(400);

      expect((response.body as ApiError).error.code).toBe('VALIDATION_FAILED');
      expect(response.text).not.toContain(PASSWORD);
      expect(response.text).not.toContain('a'.repeat(129));
      expect(await prisma.authRateLimit.count()).toBe(0);
      expect(argon2.derives).toBe(0);
    },
  );

  it('signs out only the Bearer session, whatever the body names; a replay is 401', async () => {
    await seedMember();
    const attempt = { identifier: MEMBER.email, password: PASSWORD };
    const first = await tokenOf(attempt);
    const second = await tokenOf(attempt);
    const secondRow = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(second) },
    });

    await signOut(first)
      .send({ sessionId: secondRow.id, userId: MEMBER.id })
      .expect(204);

    await me(first).expect(401, UNAUTHORIZED);
    await signOut(first).expect(401, UNAUTHORIZED);
    await me(second).expect(200);
    expect(await prisma.session.count()).toBe(1);
  });

  it('answers 401 to a sign-out without a valid session and deletes nothing', async () => {
    await seedMember();
    await tokenOf({ identifier: MEMBER.email, password: PASSWORD });

    await signOut(FAKE_TOKEN).expect(401, UNAUTHORIZED);
    await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('X-Internal-Api-Key', FAKE_KEY)
      .expect(401, UNAUTHORIZED);
    expect(await prisma.session.count()).toBe(1);
  });
});

describe('POST /auth/sign-in and sign-out, with no internal key configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await appWith({ kind: 'open' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 403 to an open caller, before any counter or verification', async () => {
    const prisma = app.get(PrismaService);
    await truncateAllTables(prisma);
    argon2.derives = 0;

    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('X-Client-Ip', IP)
      .send({ identifier: MEMBER.email, password: PASSWORD })
      .expect(403);
    const signOut = await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Authorization', `Bearer ${FAKE_TOKEN}`)
      .expect(403);

    expect((signIn.body as ApiError).error.code).toBe(INTERNAL_KEY_REQUIRED);
    expect((signOut.body as ApiError).error.code).toBe(INTERNAL_KEY_REQUIRED);
    expect(await prisma.authRateLimit.count()).toBe(0);
    expect(argon2.derives).toBe(0);
  });
});
