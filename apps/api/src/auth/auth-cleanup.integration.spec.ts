import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, FixedClock } from '../testing/test-app';
import { truncateAllTables } from '../testing/test-database';
import { AuthCleanupService } from './auth-cleanup.service';
import { RATE_LIMIT_LONGEST_WINDOW_MS } from './auth-rate-limit-rules';
import { SESSION_MAX_AGE_MS } from './session-rules';
import { PENDING_SIGN_UP_TTL_MS } from './sign-up-rules';

// Each rule's boundary: a row at the cutoff goes, a row 1 ms inside its life stays.
const NOW = new Date('2026-11-17T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
/** An obvious fake digest of the stored length (32 bytes). */
const digest = (fill: number, length = 32): Uint8Array<ArrayBuffer> =>
  new Uint8Array(length).fill(fill);
const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('AuthCleanupService on Postgres', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cleanup: AuthCleanupService;

  async function seedUser(
    n: number,
    options: { readonly verified: boolean; readonly createdAt: Date },
  ): Promise<string> {
    const userId = id(n);
    await prisma.user.create({
      data: {
        id: userId,
        email: `member${n}@example.test`,
        username: `Member${n}`,
        usernameKey: `member${n}`,
        passwordHash: '$argon2id$fake',
        emailVerifiedAt: options.verified ? options.createdAt : null,
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
      },
    });
    return userId;
  }

  async function seedSession(
    n: number,
    userId: string,
    times: { readonly createdAt: Date; readonly expiresAt: Date },
  ): Promise<string> {
    const sessionId = id(100 + n);
    await prisma.session.create({
      data: {
        id: sessionId,
        tokenHash: digest(n),
        userId,
        sessionEpoch: 0,
        ...times,
      },
    });
    return sessionId;
  }

  async function seedToken(
    fill: number,
    userId: string,
    times: { readonly expiresAt: Date; readonly usedAt?: Date },
  ): Promise<void> {
    await prisma.authToken.create({
      data: {
        tokenHash: digest(fill),
        purpose: 'EMAIL_VERIFICATION',
        userId,
        createdAt: at(-DAY),
        ...times,
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ clock: new FixedClock(NOW) });
    prisma = app.get(PrismaService);
    cleanup = app.get(AuthCleanupService);
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('removes nothing from empty tables', async () => {
    expect(await cleanup.removeEndedRateLimits()).toBe(0);
    expect(await cleanup.removeExpiredSessions()).toBe(0);
    expect(await cleanup.removeExpiredTokens()).toBe(0);
    expect(await cleanup.removeExpiredUsernameHolds()).toBe(0);
    expect(await cleanup.removeExpiredPendingSignUps()).toBe(0);
  });

  it('removes sessions at their expiry or their 180-day hard stop', async () => {
    const userId = await seedUser(1, { verified: true, createdAt: at(-DAY) });
    const live = { createdAt: at(-DAY), expiresAt: at(DAY) };
    await seedSession(1, userId, { ...live, expiresAt: NOW });
    const idleKept = await seedSession(2, userId, {
      ...live,
      expiresAt: at(1),
    });
    await seedSession(3, userId, {
      ...live,
      createdAt: at(-SESSION_MAX_AGE_MS),
    });
    const ageKept = await seedSession(4, userId, {
      ...live,
      createdAt: at(-SESSION_MAX_AGE_MS + 1),
    });

    expect(await cleanup.removeExpiredSessions()).toBe(2);

    const left = await prisma.session.findMany({ orderBy: { id: 'asc' } });
    expect(left.map((session) => session.id)).toEqual([idleKept, ageKept]);
  });

  it('removes expired tokens, used or not, and keeps live ones, used or not', async () => {
    const userId = await seedUser(1, { verified: true, createdAt: at(-DAY) });
    await seedToken(1, userId, { expiresAt: NOW });
    await seedToken(2, userId, { expiresAt: at(-HOUR), usedAt: at(-2 * HOUR) });
    await seedToken(3, userId, { expiresAt: at(1) });
    await seedToken(4, userId, { expiresAt: at(1), usedAt: at(-HOUR) });

    expect(await cleanup.removeExpiredTokens()).toBe(2);

    const left = await prisma.authToken.findMany({
      orderBy: { tokenHash: 'asc' },
    });
    expect(left.map((token) => token.tokenHash[0])).toEqual([3, 4]);
  });

  it('removes username holds at their expiry', async () => {
    await prisma.usernameHold.createMany({
      data: [
        { usernameKey: 'frieren', expiresAt: NOW },
        { usernameKey: 'himmel', expiresAt: at(1) },
      ],
    });

    expect(await cleanup.removeExpiredUsernameHolds()).toBe(1);

    const left = await prisma.usernameHold.findMany();
    expect(left.map((hold) => hold.usernameKey)).toEqual(['himmel']);
  });

  it('removes rate-limit counters whose window started a day ago, keeping one 1 ms younger', async () => {
    await prisma.authRateLimit.createMany({
      data: [
        {
          key: digest(1),
          windowStart: at(-RATE_LIMIT_LONGEST_WINDOW_MS),
          count: 3,
        },
        {
          key: digest(2),
          windowStart: at(-RATE_LIMIT_LONGEST_WINDOW_MS + 1),
          count: 3,
        },
        { key: digest(3), windowStart: at(-HOUR), count: 1 },
      ],
    });

    expect(await cleanup.removeEndedRateLimits()).toBe(1);

    const left = await prisma.authRateLimit.findMany({
      orderBy: { key: 'asc' },
    });
    expect(left.map((counter) => counter.key[0])).toEqual([2, 3]);
  });

  it('removes an unverified account past the TTL with its session and token, and nothing else', async () => {
    const expired = await seedUser(1, {
      verified: false,
      createdAt: at(-PENDING_SIGN_UP_TTL_MS),
    });
    await seedSession(1, expired, { createdAt: at(-HOUR), expiresAt: at(DAY) });
    await seedToken(1, expired, { expiresAt: NOW });
    const young = await seedUser(2, {
      verified: false,
      createdAt: at(-PENDING_SIGN_UP_TTL_MS + 1),
    });
    const resubmitted = await seedUser(3, {
      verified: false,
      createdAt: at(-3 * DAY),
    });
    await seedToken(3, resubmitted, { expiresAt: at(1) });
    const verified = await seedUser(4, {
      verified: true,
      createdAt: at(-3 * DAY),
    });

    expect(await cleanup.removeExpiredPendingSignUps()).toBe(1);

    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    expect(users.map((user) => user.id)).toEqual([
      young,
      resubmitted,
      verified,
    ]);
    expect(await prisma.session.count()).toBe(0);
    const tokens = await prisma.authToken.findMany();
    expect(tokens.map((token) => token.userId)).toEqual([resubmitted]);
  });

  it('refuses a token hash or a binding hash that is not 32 bytes, and a binding on a reset token', async () => {
    const userId = await seedUser(1, { verified: true, createdAt: at(-DAY) });
    const insert = (
      tokenHash: Uint8Array<ArrayBuffer>,
      purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
      bindingHash: Uint8Array<ArrayBuffer> | null,
    ) => prisma.$executeRaw`
      INSERT INTO auth_token (token_hash, purpose, user_id, binding_hash, created_at, expires_at)
      VALUES (${tokenHash}, ${purpose}::auth_token_purpose, ${userId}::uuid, ${bindingHash},
        ${NOW.toISOString()}::timestamptz, ${at(HOUR).toISOString()}::timestamptz)`;

    await expect(
      insert(digest(1, 31), 'EMAIL_VERIFICATION', null),
    ).rejects.toThrow('auth_token_token_hash_length_check');
    await expect(
      insert(digest(2), 'EMAIL_VERIFICATION', digest(9, 31)),
    ).rejects.toThrow('auth_token_binding_hash_length_check');
    await expect(
      insert(digest(3), 'PASSWORD_RESET', digest(9)),
    ).rejects.toThrow('auth_token_binding_purpose_check');
    await expect(
      insert(digest(4), 'EMAIL_VERIFICATION', digest(9)),
    ).resolves.toBe(1);
    await expect(insert(digest(5), 'PASSWORD_RESET', null)).resolves.toBe(1);
  });
});
