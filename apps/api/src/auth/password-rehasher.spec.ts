import { createHash } from 'node:crypto';
import { HttpStatus, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiException } from '../common/api.exception';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock, SequentialRandom } from '../testing/test-app';
import { Argon2id, type Argon2idInput } from './argon2id';
import { HashSlots } from './hash-slots';
import { PasswordHasher } from './password-hasher';
import { ARGON2_PARAMS, formatPhc } from './password-phc';
import { PasswordRehasher } from './password-rehasher';

// No database: a fake updateMany. The real compare-and-set: sign-in.integration.spec.ts.
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const PASSWORD = 'fake password for tests 1';
const OLD_PHC = formatPhc(
  { memoryKiB: 8_192, passes: 3, parallelism: 1 },
  Buffer.alloc(16, 7),
  Buffer.alloc(32, 9),
);
const CURRENT_PHC = formatPhc(
  ARGON2_PARAMS,
  Buffer.alloc(16, 7),
  Buffer.alloc(32, 9),
);
const REQUEST = { userId: USER_ID, password: PASSWORD, storedHash: OLD_PHC };

class FakeArgon2id extends Argon2id {
  derive(input: Argon2idInput): Promise<Buffer> {
    return Promise.resolve(
      createHash('shake256', { outputLength: input.tagLength })
        .update(input.password)
        .update(input.salt)
        .digest(),
    );
  }
}

type UpdateMany = (args: unknown) => Promise<{ count: number }>;

function setup(updateMany: UpdateMany = () => Promise.resolve({ count: 1 })) {
  const hasher = new PasswordHasher(
    new FakeArgon2id(),
    new HashSlots(),
    new SequentialRandom(),
    new FixedClock(new Date('2026-11-17T10:00:00.000Z')),
  );
  const update = vi.fn(updateMany);
  const prisma = { user: { updateMany: update } } as unknown as PrismaService;
  const hash = vi.spyOn(hasher, 'hash');
  const warn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  return { rehasher: new PasswordRehasher(prisma, hasher), hash, update, warn };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PasswordRehasher.schedule', () => {
  it('leaves a hash at the current cost alone: no argon2, no write', async () => {
    const { rehasher, hash, update, warn } = setup();

    await rehasher.schedule({ ...REQUEST, storedHash: CURRENT_PHC });

    expect(hash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rehashes an older cost and replaces only the hash it read', async () => {
    const { rehasher, hash, update, warn } = setup();

    await rehasher.schedule(REQUEST);

    expect(hash).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    const newPhc = await (hash.mock.results[0]?.value as Promise<string>);
    expect(newPhc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(update).toHaveBeenCalledExactlyOnceWith({
      where: { id: USER_ID, passwordHash: OLD_PHC },
      data: { passwordHash: newPhc },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes nothing more and stays silent when the hash changed since the lookup', async () => {
    const { rehasher, update, warn } = setup(() =>
      Promise.resolve({ count: 0 }),
    );

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('swallows AUTH_BUSY with one warning naming the user id only, and writes nothing', async () => {
    const { rehasher, hash, update, warn } = setup();
    hash.mockRejectedValue(
      new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        { code: 'AUTH_BUSY', message: 'Fake busy.' },
        { retryAfterSeconds: 1 },
      ),
    );

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Password rehash skipped for user ${USER_ID} (hash cap reached); retried at the next sign-in.`,
    );
  });

  it('swallows a database error with one warning that never quotes the error, password or hash', async () => {
    const { rehasher, warn } = setup(() =>
      Promise.reject(new Error(`fake outage: passwordHash = ${OLD_PHC}`)),
    );

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Password rehash skipped for user ${USER_ID} (hash or update failed); retried at the next sign-in.`,
    );
  });
});
