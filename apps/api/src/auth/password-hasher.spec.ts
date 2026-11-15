import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { toErrorResponse } from '../common/filters/api-exception.filter';
import { SequentialRandom } from '../testing/test-app';
import { Argon2id, type Argon2idInput } from './argon2id';
import {
  HashSlots,
  MAX_RUNNING_HASHES,
  MAX_WAITING_HASHES,
} from './hash-slots';
import { PasswordHasher } from './password-hasher';
import { ARGON2_PARAMS, DUMMY_PHC, formatPhc } from './password-phc';

/** Fast stand-in: a tag that depends on the password, the salt and every parameter. */
function fakeTag(input: Argon2idInput): Buffer {
  const { memoryKiB, passes, parallelism, tagLength } = input;
  return createHash('shake256', { outputLength: tagLength })
    .update(input.password)
    .update(input.salt)
    .update(`${memoryKiB},${passes},${parallelism}`)
    .digest();
}

class FakeArgon2id extends Argon2id {
  readonly calls: Argon2idInput[] = [];

  constructor(private readonly hold: Promise<void> = Promise.resolve()) {
    super();
  }

  async derive(input: Argon2idInput): Promise<Buffer> {
    this.calls.push(input);
    await this.hold;
    return fakeTag(input);
  }
}

function setup(argon2 = new FakeArgon2id()) {
  const hasher = new PasswordHasher(
    argon2,
    new HashSlots(),
    new SequentialRandom(),
  );
  return { argon2, hasher };
}

const DUMMY_COST = {
  salt: DUMMY_PHC.salt,
  memoryKiB: 19_456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
};

describe('PasswordHasher', () => {
  it('hashes with the current parameters and a salt from Random', async () => {
    const { argon2, hasher } = setup();

    const first = await hasher.hash('correct horse 1');
    const second = await hasher.hash('correct horse 1');

    const salt = Buffer.alloc(16);
    salt[15] = 1;
    expect(argon2.calls[0]).toMatchObject({ ...DUMMY_COST, salt });
    expect(first).toBe(
      formatPhc(
        ARGON2_PARAMS,
        salt,
        fakeTag({
          ...DUMMY_COST,
          salt,
          password: Buffer.from('correct horse 1'),
        }),
      ),
    );
    expect(first).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$AAAAAAAAAAAAAAAAAAAAAQ\$/,
    );
    expect(second).not.toBe(first);
    expect(hasher.needsRehash(first)).toBe(false);
  });

  it('matches only the password it hashed', async () => {
    const { hasher } = setup();
    const phc = await hasher.hash('correct horse 1');

    await expect(hasher.verify('correct horse 1', phc)).resolves.toBe('match');
    await expect(hasher.verify('Correct horse 1', phc)).resolves.toBe(
      'mismatch',
    );
    await expect(hasher.verify('', phc)).resolves.toBe('mismatch');
  });

  it('never matches the hash of another account', async () => {
    const { hasher } = setup();
    const someoneElse = await hasher.hash('correct horse 1');
    const mine = await hasher.hash('correct horse 1');

    expect(mine).not.toBe(someoneElse);
    await expect(hasher.verify('correct horse 2', someoneElse)).resolves.toBe(
      'mismatch',
    );
  });

  it('treats the composed and decomposed é as the same password (NFC)', async () => {
    const { argon2, hasher } = setup();
    const phc = await hasher.hash('café au lait 1');

    await expect(hasher.verify('café au lait 1', phc)).resolves.toBe('match');
    expect(argon2.calls[1]?.password).toEqual(Buffer.from('café au lait 1'));
  });

  it.each([
    ['no hash', null],
    ['a fake', '$argon2id$fake'],
    ['an empty hash', ''],
    [
      'a hash asking for 4 GiB',
      formatPhc(
        { memoryKiB: 4_194_304, passes: 2, parallelism: 1 },
        Buffer.alloc(16),
        Buffer.alloc(32),
      ),
    ],
  ])('verifies %s once at full cost and answers mismatch', async (_, phc) => {
    const { argon2, hasher } = setup();

    await expect(hasher.verify('correct horse 1', phc)).resolves.toBe(
      'mismatch',
    );
    expect(argon2.calls).toHaveLength(1);
    expect(argon2.calls[0]).toMatchObject(DUMMY_COST);
  });

  it('answers mismatch even when the password derives the dummy tag', async () => {
    const argon2 = new FakeArgon2id();
    vi.spyOn(argon2, 'derive').mockResolvedValue(DUMMY_PHC.tag);
    const { hasher } = setup(argon2);

    await expect(hasher.verify('anything', null)).resolves.toBe('mismatch');
  });

  it('verifies with the parameters stored in the hash', async () => {
    const { argon2, hasher } = setup();
    const cost = { memoryKiB: 8_192, passes: 3, parallelism: 1 };
    const salt = Buffer.alloc(16, 7);
    const tag = fakeTag({
      ...cost,
      salt,
      tagLength: 32,
      password: Buffer.from('old password 1'),
    });
    const old = formatPhc(cost, salt, tag);

    await expect(hasher.verify('old password 1', old)).resolves.toBe('match');
    expect(argon2.calls[0]).toMatchObject({ ...cost, salt, tagLength: 32 });
    expect(hasher.needsRehash(old)).toBe(true);
  });

  it('refuses with 503 AUTH_BUSY and Retry-After 1 once every slot and place is taken', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { argon2, hasher } = setup(new FakeArgon2id(hold));
    const queued = Array.from(
      { length: MAX_RUNNING_HASHES + MAX_WAITING_HASHES },
      () => hasher.verify('correct horse 1', null),
    );

    const refusal: unknown = await hasher
      .verify('correct horse 1', null)
      .catch((caught: unknown) => caught);

    expect(toErrorResponse(refusal)).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      body: {
        error: { code: 'AUTH_BUSY', message: expect.any(String) as string },
      },
      retryAfterSeconds: 1,
    });
    expect(argon2.calls).toHaveLength(MAX_RUNNING_HASHES);
    release();
    await expect(Promise.all(queued)).resolves.toHaveLength(
      MAX_RUNNING_HASHES + MAX_WAITING_HASHES,
    );
  });
});
