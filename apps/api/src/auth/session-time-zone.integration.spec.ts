import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, FixedClock } from '../testing/test-app';
import {
  connectMaintenance,
  databaseName,
  truncateAllTables,
} from '../testing/test-database';
import { SessionService } from './session.service';
import {
  hashSessionToken,
  SESSION_IDLE_MS,
  SESSION_RENEW_BELOW_MS,
} from './session-rules';

// OTA-200: @prisma/adapter-pg drops the offset on timestamptz reads and writes. This file's
// database defaults to Asia/Tokyo (UTC+9, no daylight saving time); the app's pool must still
// store, read and compare the true instants because it pins its sessions to UTC.
const DATABASE_ZONE = 'Asia/Tokyo';
const NOW = new Date('2026-11-14T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// An obvious fake token of the valid shape (43 base64url characters).
const TOKEN = 'fake-session-token-'.padEnd(43, 'A');
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const SESSION_ID = '10000000-0000-4000-8000-0000000000a1';
const USERNAME = 'Member';

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

/** This file's clone (integration-setup.ts points DATABASE_URL at it). */
function cloneUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set by integration-setup.ts');
  return url;
}

/** Applies to sessions opened afterwards, so it runs before the app's pool connects. */
async function setDatabaseZone(): Promise<void> {
  const clone = databaseName(new URL(cloneUrl()));
  const maintenance = connectMaintenance(new URL(inject('testDatabaseUrl')));
  try {
    await maintenance.$executeRawUnsafe(
      `ALTER DATABASE "${clone}" SET timezone TO '${DATABASE_ZONE}'`,
    );
  } finally {
    await maintenance.$disconnect();
  }
}

async function sessionZone(client: PrismaClient): Promise<string> {
  const [row] = await client.$queryRaw<[{ zone: string }]>`
    SELECT current_setting('TimeZone') AS zone`;
  return row.zone;
}

async function seed(prisma: PrismaService, expiresAt: Date): Promise<void> {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: 'member@example.test',
      username: USERNAME,
      usernameKey: USERNAME.toLowerCase(),
      passwordHash: '$argon2id$fake',
      emailVerifiedAt: at(-9 * DAY),
      sessionEpoch: 0,
      createdAt: at(-10 * DAY),
      updatedAt: at(-10 * DAY),
      sessions: {
        create: {
          id: SESSION_ID,
          tokenHash: hashSessionToken(TOKEN),
          sessionEpoch: 0,
          createdAt: at(-DAY),
          expiresAt,
        },
      },
    },
  });
}

interface StoredSessionTimes {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Computed by Postgres from the stored value, whatever the session zone: proves the write. */
  readonly expiresAtMs: number;
}

async function storedTimes(prisma: PrismaService): Promise<StoredSessionTimes> {
  const [row] = await prisma.$queryRaw<[StoredSessionTimes]>`
    SELECT created_at AS "createdAt", expires_at AS "expiresAt",
      (EXTRACT(EPOCH FROM expires_at) * 1000)::float8 AS "expiresAtMs"
    FROM auth_session`;
  return row;
}

describe(`sessions on a database whose default zone is ${DATABASE_ZONE}`, () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sessions: SessionService;

  beforeAll(async () => {
    await setDatabaseZone();
    app = await createTestApp({ clock: new FixedClock(NOW) });
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the app pool in UTC while a connection without the pin gets the database zone', async () => {
    // Deliberately built without databasePoolConfig: shows the zone the pin overrides.
    const unpinned = new PrismaClient({
      adapter: new PrismaPg({ connectionString: cloneUrl() }),
    });
    try {
      expect(await sessionZone(unpinned)).toBe(DATABASE_ZONE);
    } finally {
      await unpinned.$disconnect();
    }

    expect(await sessionZone(prisma)).toBe('UTC');
  });

  it('stores and reads back the true instants', async () => {
    await seed(prisma, at(20 * DAY));

    expect(await storedTimes(prisma)).toEqual({
      createdAt: at(-DAY),
      expiresAt: at(20 * DAY),
      expiresAtMs: at(20 * DAY).getTime(),
    });
  });

  it('signs out a session that expired an hour ago', async () => {
    await seed(prisma, at(-HOUR));

    expect(await sessions.resolve(TOKEN)).toEqual({ kind: 'signed_out' });
    expect((await storedTimes(prisma)).expiresAtMs).toBe(at(-HOUR).getTime());
  });

  it('renews a session 1 ms inside the renewal window to now + 30 days', async () => {
    await seed(prisma, at(SESSION_RENEW_BELOW_MS - 1));

    expect(await sessions.resolve(TOKEN)).toEqual({
      kind: 'signed_in',
      session: { sessionId: SESSION_ID, userId: USER_ID, username: USERNAME },
    });
    expect(await storedTimes(prisma)).toEqual({
      createdAt: at(-DAY),
      expiresAt: at(SESSION_IDLE_MS),
      expiresAtMs: at(SESSION_IDLE_MS).getTime(),
    });
  });
});
