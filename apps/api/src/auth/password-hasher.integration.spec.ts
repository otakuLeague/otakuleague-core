import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app';
import { NodeArgon2id } from './argon2id';
import { PasswordHasher } from './password-hasher';
import { ARGON2_PARAMS, parsePhc } from './password-phc';

// The real crypto.argon2 (Node >= 24.7), wired by AuthModule. No table is used.
// Reference: libargon2 via argon2-cffi hash_secret(type=ID), same password, salt and parameters.
const PASSWORD = 'correct horse battery staple';
const SALT = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const REFERENCE_TAG =
  '818259b6310026a8e0dbac5d2e6927abcfdb07b32258fac4f61b18b80f929085';
const REFERENCE_PHC =
  '$argon2id$v=19$m=19456,t=2,p=1$AAECAwQFBgcICQoLDA0ODw$gYJZtjEAJqjg26xdLmknq8/bB7MiWPrE9hsYuA+SkIU';

describe('PasswordHasher with crypto.argon2', () => {
  let app: INestApplication<App>;
  let hasher: PasswordHasher;

  beforeAll(async () => {
    app = await createTestApp();
    hasher = app.get(PasswordHasher);
  });

  afterAll(async () => {
    await app.close();
  });

  it('derives the libargon2 reference tag', async () => {
    const tag = await new NodeArgon2id().derive({
      password: Buffer.from(PASSWORD),
      salt: SALT,
      memoryKiB: ARGON2_PARAMS.memoryKiB,
      passes: ARGON2_PARAMS.passes,
      parallelism: ARGON2_PARAMS.parallelism,
      tagLength: ARGON2_PARAMS.tagLength,
    });

    expect(tag.toString('hex')).toBe(REFERENCE_TAG);
  });

  it('verifies the hash libargon2 encoded', async () => {
    await expect(hasher.verify(PASSWORD, REFERENCE_PHC)).resolves.toBe('match');
    await expect(hasher.verify(`${PASSWORD}!`, REFERENCE_PHC)).resolves.toBe(
      'mismatch',
    );
  });

  it('round-trips a fresh hash with a 16-byte salt and a 32-byte tag', async () => {
    const phc = await hasher.hash(PASSWORD);

    expect(parsePhc(phc)).toMatchObject({
      salt: expect.objectContaining({ length: 16 }) as Buffer,
      tag: expect.objectContaining({ length: 32 }) as Buffer,
    });
    expect(phc).not.toBe(REFERENCE_PHC);
    await expect(hasher.verify(PASSWORD, phc)).resolves.toBe('match');
    await expect(
      hasher.verify('wrong horse battery staple', phc),
    ).resolves.toBe('mismatch');
    expect(hasher.needsRehash(phc)).toBe(false);
  });
});
