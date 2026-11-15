import { describe, expect, it } from 'vitest';
import {
  ARGON2_PARAMS,
  DUMMY_PHC,
  formatPhc,
  needsRehash,
  parsePhc,
} from './password-phc';

// Encoded by libargon2 (argon2-cffi hash_secret, type ID) for "correct horse battery staple".
const SALT = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const TAG = Buffer.from(
  '818259b6310026a8e0dbac5d2e6927abcfdb07b32258fac4f61b18b80f929085',
  'hex',
);
const GOLDEN =
  '$argon2id$v=19$m=19456,t=2,p=1$AAECAwQFBgcICQoLDA0ODw$gYJZtjEAJqjg26xdLmknq8/bB7MiWPrE9hsYuA+SkIU';
const SALT_B64 = 'AAECAwQFBgcICQoLDA0ODw';
const TAG_B64 = 'gYJZtjEAJqjg26xdLmknq8/bB7MiWPrE9hsYuA+SkIU';

describe('formatPhc and parsePhc', () => {
  it('writes the libargon2 encoding', () => {
    expect(formatPhc(ARGON2_PARAMS, SALT, TAG)).toBe(GOLDEN);
  });

  it('reads back what it wrote', () => {
    expect(parsePhc(GOLDEN)).toEqual({
      memoryKiB: 19_456,
      passes: 2,
      parallelism: 1,
      salt: SALT,
      tag: TAG,
    });
  });

  it.each([
    ['a fake', '$argon2id$fake'],
    ['empty', ''],
    ['argon2i', GOLDEN.replace('$argon2id$', '$argon2i$')],
    ['version 16', GOLDEN.replace('v=19', 'v=16')],
    ['trailing junk', `${GOLDEN}$x`],
    ['a trailing newline', `${GOLDEN}\n`],
    ['leading space', ` ${GOLDEN}`],
    ['memory over 64 MiB', GOLDEN.replace('m=19456', 'm=65537')],
    ['memory under 8 KiB per lane', GOLDEN.replace('m=19456', 'm=7')],
    ['a leading zero', GOLDEN.replace('m=19456', 'm=019456')],
    ['11 passes', GOLDEN.replace('t=2', 't=11')],
    ['parallelism 5', GOLDEN.replace('p=1', 'p=5')],
    ['parameters out of order', GOLDEN.replace('m=19456,t=2', 't=2,m=19456')],
    ['base64url', GOLDEN.replace(TAG_B64, TAG_B64.replace('+', '-'))],
    ['padding', GOLDEN.replace(TAG_B64, `${TAG_B64}=`)],
    ['a dangling base64 digit', GOLDEN.replace(SALT_B64, `${SALT_B64}AAA`)],
    [
      'non-canonical last bits',
      GOLDEN.replace(SALT_B64, 'AAECAwQFBgcICQoLDA0ODx'),
    ],
    ['a 15-byte salt', formatPhc(ARGON2_PARAMS, SALT.subarray(1), TAG)],
    ['a 65-byte tag', formatPhc(ARGON2_PARAMS, SALT, Buffer.alloc(65))],
  ])('refuses %s', (_, phc) => {
    expect(parsePhc(phc)).toBeNull();
  });
});

describe('needsRehash', () => {
  it('is false for a hash with the current parameters', () => {
    expect(needsRehash(GOLDEN)).toBe(false);
  });

  it.each([
    ['memory', GOLDEN.replace('m=19456', 'm=8192')],
    ['passes', GOLDEN.replace('t=2', 't=3')],
    ['parallelism', GOLDEN.replace('p=1', 'p=2')],
    ['salt length', formatPhc(ARGON2_PARAMS, Buffer.alloc(32), TAG)],
    ['tag length', formatPhc(ARGON2_PARAMS, SALT, TAG.subarray(0, 16))],
  ])('is true when the %s differs', (_, phc) => {
    expect(needsRehash(phc)).toBe(true);
  });

  it('is true for an unreadable hash', () => {
    expect(needsRehash('$argon2id$fake')).toBe(true);
  });
});

describe('DUMMY_PHC', () => {
  it('has the current parameters and survives a round trip', () => {
    const phc = formatPhc(DUMMY_PHC, DUMMY_PHC.salt, DUMMY_PHC.tag);

    expect(parsePhc(phc)).toEqual(DUMMY_PHC);
    expect(needsRehash(phc)).toBe(false);
  });
});
