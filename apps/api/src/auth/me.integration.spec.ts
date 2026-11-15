import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type InternalKeyCheck,
  InternalKeySettings,
} from '../common/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, FixedClock } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { SESSION_REQUIRED_MESSAGE } from './session.guard';
import { hashSessionToken } from './session-rules';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// Obvious fakes of a valid shape: keys of 64 characters, tokens of 43 base64url characters.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const TOKEN = 'fake-session-token-'.padEnd(43, 'A');
const OTHER_TOKEN = 'fake-other-session-'.padEnd(43, 'B');
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
const UNAUTHORIZED = {
  error: { code: 'UNAUTHORIZED', message: SESSION_REQUIRED_MESSAGE },
};

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

function appWith(check: InternalKeyCheck): Promise<INestApplication<App>> {
  return createTestApp({
    clock: new FixedClock(NOW),
    overrides: [
      { provide: InternalKeySettings, useValue: { get: () => check } },
    ],
  });
}

interface SeedOptions {
  readonly userId?: string;
  readonly token?: string;
  readonly userEpoch?: number;
  readonly expiresAt?: Date;
  readonly verified?: boolean;
}

async function seed(prisma: PrismaService, options: SeedOptions = {}) {
  const userId = options.userId ?? USER_ID;
  const name = `Member${userId.slice(-2)}`;
  await prisma.user.create({
    data: {
      id: userId,
      email: `${name.toLowerCase()}@example.test`,
      username: name,
      usernameKey: name.toLowerCase(),
      passwordHash: '$argon2id$fake',
      emailVerifiedAt: options.verified === false ? null : at(-9 * DAY),
      sessionEpoch: options.userEpoch ?? 0,
      createdAt: at(-10 * DAY),
      updatedAt: at(-10 * DAY),
      sessions: {
        create: {
          id: userId.replace(/^0/, '1'),
          tokenHash: hashSessionToken(options.token ?? TOKEN),
          sessionEpoch: 0,
          createdAt: at(-DAY),
          expiresAt: options.expiresAt ?? at(20 * DAY),
        },
      },
    },
  });
  return { userId, username: name };
}

describe('GET /me', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const me = (headers: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get('/me')
      .set({ 'X-Internal-Api-Key': FAKE_KEY, ...headers });
  const storedExpiry = async () =>
    (await prisma.session.findFirstOrThrow({ where: { userId: USER_ID } }))
      .expiresAt;

  beforeAll(async () => {
    app = await appWith({
      kind: 'enforced',
      acceptedKeys: [FAKE_KEY],
      previewKey: FAKE_PREVIEW_KEY,
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the member of a valid session, never cached', async () => {
    const member = await seed(prisma);

    const response = await me({ Authorization: `Bearer ${TOKEN}` }).expect(200);

    expect(response.body).toEqual({
      id: member.userId,
      username: member.username,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await storedExpiry()).toEqual(at(20 * DAY));
  });

  it("answers each token's own member, never another's", async () => {
    await seed(prisma);
    const other = await seed(prisma, {
      userId: OTHER_USER_ID,
      token: OTHER_TOKEN,
    });

    const response = await me({
      Authorization: `Bearer ${OTHER_TOKEN}`,
    }).expect(200);

    expect(response.body).toEqual({
      id: other.userId,
      username: other.username,
    });
  });

  it.each<[string, Record<string, string>]>([
    ['no Authorization header', {}],
    ['a malformed header', { Authorization: `Bearer ${TOKEN}=` }],
    ['an unknown token', { Authorization: `Bearer ${OTHER_TOKEN}` }],
  ])('answers 401 UNAUTHORIZED to %s', async (_, headers) => {
    await seed(prisma);

    const response = await me(headers).expect(401);

    expect(response.body).toEqual(UNAUTHORIZED);
  });

  it.each<[string, SeedOptions]>([
    ['a raised user epoch (revoked)', { userEpoch: 1 }],
    ['an expired session (expiresAt = now)', { expiresAt: NOW }],
    ['an unverified email', { verified: false }],
  ])('answers 401 UNAUTHORIZED to %s, replayed or not', async (_, options) => {
    await seed(prisma, options);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await me({ Authorization: `Bearer ${TOKEN}` }).expect(
        401,
      );
      expect(response.body).toEqual(UNAUTHORIZED);
    }
  });

  it('renews to now + 30 days only inside the window', async () => {
    await seed(prisma, { expiresAt: at(15 * DAY) });
    await me({ Authorization: `Bearer ${TOKEN}` }).expect(200);
    expect(await storedExpiry()).toEqual(at(15 * DAY));

    await prisma.session.updateMany({ data: { expiresAt: at(15 * DAY - 1) } });
    await me({ Authorization: `Bearer ${TOKEN}` }).expect(200);
    expect(await storedExpiry()).toEqual(at(30 * DAY));
  });

  it('answers 401 to a preview caller holding a valid session', async () => {
    await seed(prisma);

    const response = await request(app.getHttpServer())
      .get('/me')
      .set({
        'X-Internal-Api-Key': FAKE_PREVIEW_KEY,
        Authorization: `Bearer ${TOKEN}`,
      })
      .expect(401);

    expect(response.body).toEqual(UNAUTHORIZED);
  });
});

describe('GET /me, with no internal key configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await appWith({ kind: 'open' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 403 INTERNAL_KEY_REQUIRED, not a sign-out, to an open caller', async () => {
    const prisma = app.get(PrismaService);
    await truncateAllTables(prisma);
    await seed(prisma);

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(403);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_KEY_REQUIRED',
        message: 'This API answers only the OtakuLeague web server.',
      },
    });
  });
});
