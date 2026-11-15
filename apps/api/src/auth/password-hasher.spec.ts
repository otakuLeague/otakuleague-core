import { createHash } from 'node:crypto';
import { HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { toErrorResponse } from '../common/filters/api-exception.filter';
import { FixedClock, SequentialRandom } from '../testing/test-app';
import { Argon2id, type Argon2idInput } from './argon2id';
import {
  HashSlots,
  MAX_RUNNING_HASHES,
  MAX_WAITING_HASHES,
} from './hash-slots';
import { MAX_PASSWORD_BYTES, PasswordHasher } from './password-hasher';
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
    new FixedClock(new Date('2026-11-15T10:00:00.000Z')),
  );
  return { argon2, hasher };
}

/** A stored hash for `password` with any cost and tag length, as an older release would have written it. */
function storedHash(
  password: string,
  cost: { memoryKiB: number; passes: number; tagLength: number },
) {
  const salt = Buffer.alloc(16, 7);
  const input = { ...cost, parallelism: 1, salt };
  const tag = fakeTag({ ...input, password: Buffer.from(password) });
  return { phc: formatPhc(input, salt, tag), input };
}

const CURRENT_COST = {
  memoryKiB: 19_456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
};
const DUMMY_RUN = { ...CURRENT_COST, salt: DUMMY_PHC.salt };
const TOO_LONG = 'a'.repeat(MAX_PASSWORD_BYTES + 1);

async function refusalOf(promise: Promise<unknown>) {
  return toErrorResponse(await promise.catch((caught: unknown) => caught));
}

describe('PasswordHasher', () => {
  it('hashes with the current parameters and a salt from Random', async () => {
    const { argon2, hasher } = setup();

    const first = await hasher.hash('correct horse 1');
    const second = await hasher.hash('correct horse 1');

    const salt = Buffer.alloc(16);
    salt[15] = 1;
    expect(argon2.calls[0]).toMatchObject({ ...CURRENT_COST, salt });
    expect(first).toBe(
      formatPhc(
        ARGON2_PARAMS,
        salt,
        fakeTag({
          ...CURRENT_COST,
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
    const composed = 'café au lait 1'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);

    const phc = await hasher.hash(composed);

    await expect(hasher.verify(decomposed, phc)).resolves.toBe('match');
    expect(argon2.calls[1]?.password).toEqual(Buffer.from(composed));
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
    expect(argon2.calls[0]).toMatchObject(DUMMY_RUN);
  });

  it('answers mismatch even when the password derives the dummy tag', async () => {
    const argon2 = new FakeArgon2id();
    vi.spyOn(argon2, 'derive').mockResolvedValue(DUMMY_PHC.tag);
    const { hasher } = setup(argon2);

    await expect(hasher.verify('anything', null)).resolves.toBe('mismatch');
  });

  it('verifies with the parameters stored in the hash', async () => {
    const { argon2, hasher } = setup();
    const old = storedHash('old password 1', {
      memoryKiB: 8_192,
      passes: 3,
      tagLength: 32,
    });

    await expect(hasher.verify('old password 1', old.phc)).resolves.toBe(
      'match',
    );
    expect(argon2.calls[0]).toMatchObject(old.input);
    expect(hasher.needsRehash(old.phc)).toBe(true);
  });

  it('matches a stored 16-byte tag and asks for a rehash', async () => {
    const { argon2, hasher } = setup();
    const old = storedHash('old password 1', {
      ...CURRENT_COST,
      tagLength: 16,
    });

    await expect(hasher.verify('old password 1', old.phc)).resolves.toBe(
      'match',
    );
    expect(argon2.calls[0]?.tagLength).toBe(16);
    expect(hasher.needsRehash(old.phc)).toBe(true);
  });

  it(`hashes ${MAX_PASSWORD_BYTES} UTF-8 bytes and refuses one more with 400`, async () => {
    const { argon2, hasher } = setup();

    await expect(hasher.hash(TOO_LONG.slice(1))).resolves.toMatch(
      /^\$argon2id\$/,
    );
    await expect(refusalOf(hasher.hash(TOO_LONG))).resolves.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      body: { error: { code: 'BAD_REQUEST' } },
    });
    // The cap counts bytes, not characters: 513 × é is 1026 bytes.
    await expect(
      refusalOf(hasher.hash('é'.repeat(513))),
    ).resolves.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(argon2.calls).toHaveLength(1);
  });

  it('verifies an over-long password against the dummy and answers mismatch', async () => {
    const { argon2, hasher } = setup();
    const phc = await hasher.hash(TOO_LONG.slice(1));

    await expect(hasher.verify(TOO_LONG, phc)).resolves.toBe('mismatch');
    expect(argon2.calls[1]).toMatchObject({
      ...DUMMY_RUN,
      password: Buffer.alloc(0),
    });
  });

  it('refuses with 429 AUTH_BUSY and Retry-After 1 once every slot and place is taken', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { argon2, hasher } = setup(new FakeArgon2id(hold));
    const queued = Array.from(
      { length: MAX_RUNNING_HASHES + MAX_WAITING_HASHES },
      () => hasher.verify('correct horse 1', null),
    );

    const refusal = await refusalOf(hasher.verify('correct horse 1', null));
    await refusalOf(hasher.hash('correct horse 1'));

    expect(refusal).toEqual({
      status: HttpStatus.TOO_MANY_REQUESTS,
      body: {
        error: { code: 'AUTH_BUSY', message: expect.any(String) as string },
      },
      retryAfterSeconds: 1,
    });
    expect(argon2.calls).toHaveLength(MAX_RUNNING_HASHES);
    expect(warn).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all(queued)).resolves.toHaveLength(
      MAX_RUNNING_HASHES + MAX_WAITING_HASHES,
    );
    warn.mockRestore();
  });
});
