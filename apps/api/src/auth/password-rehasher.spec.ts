import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { FixedClock, SequentialRandom } from '../testing/test-app';
import { Argon2id, type Argon2idInput } from './argon2id';
import { HashSlots, MAX_RUNNING_HASHES } from './hash-slots';
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
const FAILED_WARNING = `Password rehash failed for user ${USER_ID}; retried at the next sign-in.`;

/** Lets every pending promise callback run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakeArgon2id extends Argon2id {
  derives = 0;

  constructor(private readonly hold: Promise<void> = Promise.resolve()) {
    super();
  }

  async derive(input: Argon2idInput): Promise<Buffer> {
    this.derives += 1;
    await this.hold;
    return createHash('shake256', { outputLength: input.tagLength })
      .update(input.password)
      .update(input.salt)
      .digest();
  }
}

type UpdateMany = (args: unknown) => Promise<{ count: number }>;

function setup(
  updateMany: UpdateMany = () => Promise.resolve({ count: 1 }),
  argon2 = new FakeArgon2id(),
) {
  const hasher = new PasswordHasher(
    argon2,
    new HashSlots(),
    new SequentialRandom(),
    new FixedClock(new Date('2026-11-17T10:00:00.000Z')),
  );
  const update = vi.fn(updateMany);
  const prisma = { user: { updateMany: update } } as unknown as PrismaService;
  const tryHash = vi.spyOn(hasher, 'tryHash');
  const warn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  const rehasher = new PasswordRehasher(prisma, hasher);
  return { rehasher, hasher, argon2, tryHash, update, warn };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PasswordRehasher.schedule', () => {
  it('leaves a hash at the current cost alone: no argon2, no write', async () => {
    const { rehasher, tryHash, update, warn } = setup();

    await rehasher.schedule({ ...REQUEST, storedHash: CURRENT_PHC });

    expect(tryHash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rehashes a weaker cost and replaces only the hash it read', async () => {
    const { rehasher, tryHash, update, warn } = setup();

    await rehasher.schedule(REQUEST);

    expect(tryHash).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    expect(update).toHaveBeenCalledExactlyOnceWith({
      where: { id: USER_ID, passwordHash: OLD_PHC },
      data: {
        passwordHash: expect.stringMatching(
          /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
        ) as string,
      },
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

  it('skips silently, without queuing, when no hash slot is free', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { rehasher, hasher, argon2, update, warn } = setup(
      undefined,
      new FakeArgon2id(hold),
    );
    const signIns = Array.from({ length: MAX_RUNNING_HASHES }, () =>
      hasher.verify(PASSWORD, null),
    );

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();

    expect(argon2.derives).toBe(MAX_RUNNING_HASHES);
    expect(update).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    release();
    await Promise.all(signIns);
  });

  it('runs once per user at a time, and settles before the module goes down', async () => {
    let finishUpdate: () => void = () => undefined;
    const { rehasher, tryHash, update } = setup(
      () =>
        new Promise((resolve) => {
          finishUpdate = () => resolve({ count: 1 });
        }),
    );
    let settled = false;

    const first = rehasher.schedule(REQUEST);
    const second = rehasher.schedule(REQUEST);
    const destroyed = rehasher.onModuleDestroy().then(() => {
      settled = true;
    });
    await flush();

    expect(second).toBe(first);
    expect(settled).toBe(false);
    finishUpdate();
    await destroyed;
    expect(tryHash).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    // Done, so the next sign-in may start another one.
    const third = rehasher.schedule(REQUEST);
    expect(third).not.toBe(first);
    await flush();
    finishUpdate();
    await third;
    expect(tryHash).toHaveBeenCalledTimes(2);
  });

  it('swallows a database error with one warning that never quotes the error, password or hash', async () => {
    const { rehasher, warn } = setup(() =>
      Promise.reject(new Error(`fake outage: passwordHash = ${OLD_PHC}`)),
    );

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledExactlyOnceWith(FAILED_WARNING);
  });

  it('still resolves when the logger itself throws', async () => {
    const { rehasher, warn } = setup(() =>
      Promise.reject(new Error('fake outage')),
    );
    warn.mockImplementation(() => {
      throw new Error('fake logger failure');
    });

    await expect(rehasher.schedule(REQUEST)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
