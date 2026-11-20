import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isCommonPassword } from './common-passwords';
import { COMMON_PASSWORDS } from './common-passwords/common-passwords.data';

/** SecLists 10k-most-common.txt as fetched on 2026-11-20 (ADR 0020 Addendum 1e-iii, decision 4). */
const UPSTREAM_SHA256 =
  '68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce';

describe('COMMON_PASSWORDS', () => {
  it('is the upstream file, entry for entry: its bytes rebuilt hash to the pinned SHA-256 (P2)', () => {
    const bytes = `${COMMON_PASSWORDS.join('\n')}\n`;

    expect(createHash('sha256').update(bytes, 'utf8').digest('hex')).toBe(
      UPSTREAM_SHA256,
    );
  });

  it('holds 10,001 entries, no duplicate and none empty', () => {
    expect(COMMON_PASSWORDS).toHaveLength(10_001);
    expect(new Set(COMMON_PASSWORDS).size).toBe(10_001);
    expect(COMMON_PASSWORDS).not.toContain('');
  });

  it('holds only entries already in NFC lower case, so the set needs no mapping', () => {
    const unmapped = COMMON_PASSWORDS.filter(
      (entry) => entry.normalize('NFC').toLowerCase() !== entry,
    );

    expect(unmapped).toEqual([]);
  });
});

describe('isCommonPassword', () => {
  it.each(['password', 'passw0rd', '12345678', 'iloveyou!', "pic\\'s"])(
    'refuses %j, an entry as listed',
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it.each(['Password1', 'PASSW0RD', 'QwErTy123'])(
    'refuses %j in any letter case',
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it('normalises to NFC first: a Kelvin sign is the letter K', () => {
    expect(isCommonPassword('Killer1')).toBe(true);
  });

  it.each([
    ['padding (no trim: a space is part of a password)', ' password '],
    ['a longer string holding an entry (no substring match)', 'password1x'],
    ['an entry with a letter swapped for a digit (no leet match)', 'p4ssword'],
    ['a password nobody listed', 'fake password 1 for tests'],
    ['an empty string', ''],
  ])('accepts %s', (_, password) => {
    expect(isCommonPassword(password)).toBe(false);
  });
});
