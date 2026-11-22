import { type INestApplication, Logger } from '@nestjs/common';
import type { ApiError } from '@otakuleague/shared-types';
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
import {
  type InternalKeyCheck,
  InternalKeySettings,
} from '../common/internal-key.guard';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, FixedClock } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { SESSION_REQUIRED_MESSAGE } from './session.guard';
import { hashSessionToken, SESSION_MAX_AGE_MS } from './session-rules';

const NOW = new Date('2026-11-22T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// Obvious fakes of a valid shape: keys of 64 characters, tokens of 43 base64url characters.
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIEW_KEY = 'fake-preview-api-key-'.padEnd(64, '0');
const WRONG_KEY = 'fake-wrong-api-key-'.padEnd(64, '0');
const TOKEN = 'fake-session-token-'.padEnd(43, 'A');
const SECOND_TOKEN = 'fake-second-session-'.padEnd(43, 'C');
const OTHER_TOKEN = 'fake-other-session-'.padEnd(43, 'B');
const OLD_EPOCH_TOKEN = 'fake-old-epoch-session-'.padEnd(43, 'D');
const NEW_EPOCH_TOKEN = 'fake-new-epoch-session-'.padEnd(43, 'E');
const UNKNOWN_TOKEN = 'fake-unknown-session-'.padEnd(43, 'F');
const UNAUTHORIZED = {
  error: { code: 'UNAUTHORIZED', message: SESSION_REQUIRED_MESSAGE },
};
const INTERNAL_KEY_REQUIRED = 'INTERNAL_KEY_REQUIRED';

interface SessionSeed {
  readonly id: string;
  readonly token: string;
  /** Defaults to the member's epoch: a live session. */
  readonly sessionEpoch?: number;
  readonly createdAt?: Date;
  readonly expiresAt?: Date;
}

interface MemberSeed {
  readonly id: string;
  readonly name: string;
  readonly sessionEpoch: number;
  readonly verified?: boolean;
  readonly sessions: readonly SessionSeed[];
}

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

const MEMBER = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Frieren',
  sessionEpoch: 3,
  sessions: [
    { id: '10000000-0000-4000-8000-0000000000a1', token: TOKEN },
    { id: '10000000-0000-4000-8000-0000000000a2', token: SECOND_TOKEN },
  ],
} as const satisfies MemberSeed;
const OTHER_MEMBER = {
  id: '00000000-0000-4000-8000-0000000000b2',
  name: 'Himmel',
  sessionEpoch: 5,
  sessions: [{ id: '10000000-0000-4000-8000-0000000000b1', token: OTHER_TOKEN }],
} as const satisfies MemberSeed;

async function seed(prisma: PrismaService, member: MemberSeed): Promise<void> {
  await prisma.user.create({
    data: {
      id: member.id,
      email: `${member.name.toLowerCase()}@example.test`,
      username: member.name,
      usernameKey: member.name.toLowerCase(),
      passwordHash: '$argon2id$fake',
      emailVerifiedAt: member.verified === false ? null : at(-9 * DAY),
      sessionEpoch: member.sessionEpoch,
      createdAt: at(-10 * DAY),
      updatedAt: at(-10 * DAY),
      sessions: {
        create: member.sessions.map((session) => ({
          id: session.id,
          tokenHash: hashSessionToken(session.token),
          sessionEpoch: session.sessionEpoch ?? member.sessionEpoch,
          createdAt: session.createdAt ?? at(-DAY),
          expiresAt: session.expiresAt ?? at(20 * DAY),
        })),
      },
    },
  });
}

/** Everything sign out everywhere may write for one member: epoch, updatedAt, session rows. */
async function accountOf(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sessionEpoch: true, updatedAt: true },
  });
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    select: { id: true, sessionEpoch: true, createdAt: true, expiresAt: true },
  });
  return { ...user, sessions };
}

const databaseUnreachable = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('fake: database unreachable', {
    code: 'P1001',
    clientVersion: 'test',
  });

function appWith(check: InternalKeyCheck): Promise<INestApplication<App>> {
  return createTestApp({
    clock: new FixedClock(NOW),
    overrides: [
      { provide: InternalKeySettings, useValue: { get: () => check } },
    ],
  });
}

describe('POST /auth/sign-out-everywhere', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const signOutEverywhere = (headers: Record<string, string>) =>
    request(app.getHttpServer())
      .post('/auth/sign-out-everywhere')
      .set(headers);
  const withToken = (token: string) =>
    signOutEverywhere({
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
  const seedBoth = async (member: MemberSeed = MEMBER): Promise<void> => {
    await seed(prisma, member);
    await seed(prisma, OTHER_MEMBER);
  };
  const bothAccounts = async () => ({
    member: await accountOf(prisma, MEMBER.id),
    other: await accountOf(prisma, OTHER_MEMBER.id),
  });

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("ends every session of the Bearer session's member, whatever the request names; 204, no body, nothing logged", async () => {
    await seedBoth();
    const otherBefore = await accountOf(prisma, OTHER_MEMBER.id);
    const logged = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (level) =>
        vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

    const response = await withToken(TOKEN)
      .query({ userId: OTHER_MEMBER.id })
      .send({ userId: OTHER_MEMBER.id, sessionId: OTHER_MEMBER.sessions[0].id })
      .expect(204);

    expect(response.text).toBe('');
    expect(await accountOf(prisma, MEMBER.id)).toEqual({
      sessionEpoch: MEMBER.sessionEpoch + 1,
      updatedAt: NOW,
      sessions: [],
    });
    expect(await accountOf(prisma, OTHER_MEMBER.id)).toEqual(otherBefore);
    const lines = JSON.stringify(logged.map((spy) => spy.mock.calls));
    const digest = Buffer.from(hashSessionToken(TOKEN)).toString('hex');
    for (const secret of [TOKEN, digest]) {
      expect(lines).not.toContain(secret);
    }
    expect(logged[1]).not.toHaveBeenCalled();
    expect(logged[2]).not.toHaveBeenCalled();
  });

  it("refuses every token of the member on the very next request, and only the member's", async () => {
    await seedBoth();

    await withToken(TOKEN).expect(204);

    await me(TOKEN).expect(401, UNAUTHORIZED);
    await me(SECOND_TOKEN).expect(401, UNAUTHORIZED);
    await me(OTHER_TOKEN).expect(200);
  });

  it('refuses a session written afterwards with the old epoch (a racing sign-in), accepts one with the new epoch', async () => {
    await seedBoth();
    await withToken(TOKEN).expect(204);
    const later = { createdAt: NOW, expiresAt: at(30 * DAY) };
    await prisma.session.createMany({
      data: [
        {
          id: '10000000-0000-4000-8000-0000000000a3',
          tokenHash: hashSessionToken(OLD_EPOCH_TOKEN),
          userId: MEMBER.id,
          sessionEpoch: MEMBER.sessionEpoch,
          ...later,
        },
        {
          id: '10000000-0000-4000-8000-0000000000a4',
          tokenHash: hashSessionToken(NEW_EPOCH_TOKEN),
          userId: MEMBER.id,
          sessionEpoch: MEMBER.sessionEpoch + 1,
          ...later,
        },
      ],
    });

    await me(OLD_EPOCH_TOKEN).expect(401, UNAUTHORIZED);
    await me(NEW_EPOCH_TOKEN).expect(200);
  });

  it('answers 401 to a replay of the same token or another revoked one, and raises the epoch once', async () => {
    await seedBoth();
    await withToken(TOKEN).expect(204);
    const after = await bothAccounts();

    await withToken(TOKEN).expect(401, UNAUTHORIZED);
    await withToken(SECOND_TOKEN).expect(401, UNAUTHORIZED);

    expect(await bothAccounts()).toEqual(after);
    expect(after.member.sessionEpoch).toBe(MEMBER.sessionEpoch + 1);
  });

  it.each<[string, Record<string, string>]>([
    ['no Authorization header', { 'X-Internal-Api-Key': FAKE_KEY }],
    [
      'a malformed Bearer token',
      { 'X-Internal-Api-Key': FAKE_KEY, Authorization: `Bearer ${TOKEN}=` },
    ],
    [
      'another scheme',
      { 'X-Internal-Api-Key': FAKE_KEY, Authorization: `Basic ${TOKEN}` },
    ],
    [
      'an unknown token',
      {
        'X-Internal-Api-Key': FAKE_KEY,
        Authorization: `Bearer ${UNKNOWN_TOKEN}`,
      },
    ],
  ])('answers 401 UNAUTHORIZED to %s and changes nothing', async (_, headers) => {
    await seedBoth();
    const before = await bothAccounts();

    await signOutEverywhere(headers).expect(401, UNAUTHORIZED);

    expect(await bothAccounts()).toEqual(before);
  });

  it.each<[string, SessionSeed]>([
    [
      'an expired session (expiresAt = now)',
      { id: MEMBER.sessions[0].id, token: TOKEN, expiresAt: NOW },
    ],
    [
      'a session past the hard stop',
      {
        id: MEMBER.sessions[0].id,
        token: TOKEN,
        createdAt: at(-SESSION_MAX_AGE_MS),
      },
    ],
    [
      'a session revoked earlier (an epoch below the member’s)',
      {
        id: MEMBER.sessions[0].id,
        token: TOKEN,
        sessionEpoch: MEMBER.sessionEpoch - 1,
      },
    ],
  ])(
    'answers 401 to %s and leaves the member’s live session alone',
    async (_, stale) => {
      await seedBoth({
        ...MEMBER,
        sessions: [stale, MEMBER.sessions[1]],
      });
      const before = await bothAccounts();

      await withToken(TOKEN).expect(401, UNAUTHORIZED);

      expect(await bothAccounts()).toEqual(before);
      await me(SECOND_TOKEN).expect(200);
    },
  );

  it('answers 401 to a session of an unverified member and changes nothing', async () => {
    await seedBoth({ ...MEMBER, verified: false });
    const before = await bothAccounts();

    await withToken(TOKEN).expect(401, UNAUTHORIZED);

    expect(await bothAccounts()).toEqual(before);
  });

  it.each<[string, string]>([
    ['the preview key', FAKE_PREVIEW_KEY],
    ['a wrong key', WRONG_KEY],
    ['no key', ''],
  ])(
    'answers 403 INTERNAL_KEY_REQUIRED to %s with a valid session, and changes nothing',
    async (_, key) => {
      await seedBoth();
      const before = await bothAccounts();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${TOKEN}`,
      };
      if (key !== '') headers['X-Internal-Api-Key'] = key;

      const response = await signOutEverywhere(headers).expect(403);

      expect((response.body as ApiError).error.code).toBe(
        INTERNAL_KEY_REQUIRED,
      );
      expect(await bothAccounts()).toEqual(before);
    },
  );

  it('answers 503, never 204, when the statement fails, and the member stays signed in', async () => {
    await seedBoth();
    const before = await bothAccounts();
    vi.spyOn(prisma, '$executeRaw').mockRejectedValueOnce(
      databaseUnreachable(),
    );

    const response = await withToken(TOKEN).expect(503);

    expect((response.body as ApiError).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await bothAccounts()).toEqual(before);
    await me(TOKEN).expect(200);
  });

  it('two parallel calls from two sessions of one member: each 204 or 401, at least one 204, no row left', async () => {
    for (let round = 0; round < 5; round += 1) {
      await truncateAllTables(prisma);
      await seedBoth();
      const otherBefore = await accountOf(prisma, OTHER_MEMBER.id);

      const responses = await Promise.all([
        withToken(TOKEN),
        withToken(SECOND_TOKEN),
      ]);

      const statuses = responses.map((response) => response.status);
      for (const status of statuses) expect([204, 401]).toContain(status);
      const revoked = statuses.filter((status) => status === 204).length;
      expect(revoked).toBeGreaterThanOrEqual(1);
      const member = await accountOf(prisma, MEMBER.id);
      expect(member.sessions).toEqual([]);
      // Each 204 ran the statement once: the epoch never moves without one, nor twice for one.
      expect(member.sessionEpoch).toBe(MEMBER.sessionEpoch + revoked);
      expect(await accountOf(prisma, OTHER_MEMBER.id)).toEqual(otherBefore);
    }
  });
});

describe('POST /auth/sign-out-everywhere, with no internal key configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await appWith({ kind: 'open' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 403 INTERNAL_KEY_REQUIRED, not a sign-out, and changes nothing', async () => {
    const prisma = app.get(PrismaService);
    await truncateAllTables(prisma);
    await seed(prisma, MEMBER);
    const before = await accountOf(prisma, MEMBER.id);

    const response = await request(app.getHttpServer())
      .post('/auth/sign-out-everywhere')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(403);

    expect((response.body as ApiError).error.code).toBe(INTERNAL_KEY_REQUIRED);
    expect(await accountOf(prisma, MEMBER.id)).toEqual(before);
  });
});
