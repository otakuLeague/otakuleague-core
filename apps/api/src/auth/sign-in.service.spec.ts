import { createSecretKey } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { visitorKeyFromClientIp } from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import type { PrismaService } from '../prisma/prisma.service';
import { clientIpKey } from './auth-rate-limit-rules';
import type { AuthRateLimiter } from './auth-rate-limiter';
import type { PasswordCheck, PasswordHasher } from './password-hasher';
import type { PasswordRehasher, RehashRequest } from './password-rehasher';
import type { IssuedSession, SessionService } from './session.service';
import { SignInService } from './sign-in.service';

// No database: every collaborator is a fake. The real flow: sign-in.integration.spec.ts.
const IP = clientIpKey(visitorKeyFromClientIp('203.0.113.7'));
if (IP === null) throw new Error('203.0.113.7 is a client IP');
const ATTEMPT = {
  identifier: 'frieren@example.test',
  password: 'fake password for tests 1',
  ip: IP,
};
const ACCOUNT = {
  id: '00000000-0000-4000-8000-0000000000a1',
  passwordHash: '$argon2id$fake-stored-hash',
  emailVerifiedAt: new Date('2026-11-16T12:00:00.000Z'),
  sessionEpoch: 3,
};
const SESSION: IssuedSession = {
  sessionToken: 'fake-session-token-'.padEnd(43, 'A'),
  expiresAt: new Date('2026-12-17T12:00:00.000Z'),
};

function setup(options: {
  readonly findUnique: () => Promise<typeof ACCOUNT | null>;
  readonly verify: () => Promise<PasswordCheck>;
  readonly schedule?: (request: RehashRequest) => Promise<void>;
}) {
  const create = vi.fn(() => Promise.resolve(SESSION));
  const verify = vi.fn(options.verify);
  const schedule = vi.fn<(request: RehashRequest) => Promise<void>>(
    options.schedule ?? (() => Promise.resolve()),
  );
  const service = new SignInService(
    { user: { findUnique: options.findUnique } } as unknown as PrismaService,
    {
      check: () => Promise.resolve({ kind: 'allowed' }),
    } as unknown as AuthRateLimiter,
    { hmacKey: () => createSecretKey(Buffer.alloc(32, 1)) },
    { verify } as unknown as PasswordHasher,
    { create } as unknown as SessionService,
    { schedule } as unknown as PasswordRehasher,
  );
  return { service, create, verify, schedule };
}

describe('SignInService.signIn', () => {
  it('propagates AUTH_BUSY from the verification unchanged: no session, no rehash', async () => {
    const busy = new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      { code: 'AUTH_BUSY', message: 'Fake busy.' },
      { retryAfterSeconds: 1 },
    );
    const { service, create, schedule } = setup({
      findUnique: () => Promise.resolve(ACCOUNT),
      verify: () => Promise.reject(busy),
    });

    await expect(service.signIn(ATTEMPT)).rejects.toBe(busy);
    expect(create).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('propagates a database error from the lookup unchanged: no verification, no session', async () => {
    const outage = new Error('fake database outage');
    const { service, create, verify } = setup({
      findUnique: () => Promise.reject(outage),
      verify: () => Promise.resolve('match'),
    });

    await expect(service.signIn(ATTEMPT)).rejects.toBe(outage);
    expect(verify).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('answers signed_in without waiting for the rehash it schedules', async () => {
    const { service, schedule } = setup({
      findUnique: () => Promise.resolve(ACCOUNT),
      verify: () => Promise.resolve('match'),
      schedule: () => new Promise<void>(() => undefined),
    });

    await expect(service.signIn(ATTEMPT)).resolves.toEqual({
      kind: 'signed_in',
      ...SESSION,
    });
    expect(schedule).toHaveBeenCalledExactlyOnceWith({
      userId: ACCOUNT.id,
      password: ATTEMPT.password,
      storedHash: ACCOUNT.passwordHash,
    });
  });
});
