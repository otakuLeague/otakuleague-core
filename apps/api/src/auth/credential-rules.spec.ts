import {
  IDENTIFIER_MAX,
  PASSWORD_MIN,
  PASSWORD_RAW_MAX,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import {
  identifierKind,
  normaliseIdentifier,
  normalisePassword,
  PASSWORD_MAX,
  passwordLength,
} from './credential-rules';

// Built from code points: an editor that normalises a pasted "é" would silently change the test.
const COMBINING_ACUTE = String.fromCodePoint(0x301);
const E_ACUTE = String.fromCodePoint(0xe9);
const CAPITAL_E_ACUTE = String.fromCodePoint(0xc9);
const CAPITAL_I_DOT = String.fromCodePoint(0x130);
const GRINNING_FACE = String.fromCodePoint(0x1f600);
const DECOMPOSED_E_ACUTE = `e${COMBINING_ACUTE}`;

describe('credential bounds (ADR 0015)', () => {
  it('pins the password and identifier limits', () => {
    expect([PASSWORD_MIN, PASSWORD_MAX, IDENTIFIER_MAX]).toEqual([8, 128, 254]);
  });

  it('caps the raw password at 8 UTF-16 units per allowed code point', () => {
    expect(PASSWORD_RAW_MAX).toBe(8 * PASSWORD_MAX);
  });
});

describe('normalisePassword', () => {
  it('composes a decomposed accent and changes nothing else', () => {
    expect(normalisePassword(`caf${DECOMPOSED_E_ACUTE} Pass`)).toBe(
      `caf${E_ACUTE} Pass`,
    );
    expect(normalisePassword('  Spaces Kept  ')).toBe('  Spaces Kept  ');
  });
});

describe('passwordLength', () => {
  it('counts a base letter with a combining accent once', () => {
    expect(DECOMPOSED_E_ACUTE.length).toBe(2);
    expect(passwordLength(DECOMPOSED_E_ACUTE)).toBe(1);
  });

  it('counts an emoji outside the BMP once, not as two UTF-16 units', () => {
    expect(GRINNING_FACE.length).toBe(2);
    expect(passwordLength(GRINNING_FACE)).toBe(1);
  });

  it('counts the empty password as 0', () => {
    expect(passwordLength('')).toBe(0);
  });

  it.each([
    [7, 'below the minimum'],
    [8, 'the minimum'],
    [128, 'the maximum'],
    [129, 'above the maximum'],
  ])('measures %i characters (%s)', (count) => {
    for (const character of ['a', E_ACUTE, DECOMPOSED_E_ACUTE, GRINNING_FACE]) {
      expect(passwordLength(character.repeat(count))).toBe(count);
    }
  });
});

describe('normaliseIdentifier', () => {
  it('trims and lower-cases an email or a username', () => {
    expect(normaliseIdentifier('  Frieren@Example.COM \n')).toBe(
      'frieren@example.com',
    );
    expect(normaliseIdentifier('\tHimmel_The_Hero ')).toBe('himmel_the_hero');
  });

  it('gives one form for composed and decomposed accents', () => {
    expect(normaliseIdentifier(`Am${DECOMPOSED_E_ACUTE}lie`)).toBe(
      `am${E_ACUTE}lie`,
    );
    expect(normaliseIdentifier(`AM${CAPITAL_E_ACUTE}LIE`)).toBe(
      `am${E_ACUTE}lie`,
    );
  });

  it('is NFC even where lower-casing decomposes, and idempotent', () => {
    const once = normaliseIdentifier(`${CAPITAL_I_DOT}STANBUL`);

    expect(once).toBe(once.normalize('NFC'));
    expect(normaliseIdentifier(once)).toBe(once);
  });

  it('turns an identifier of only spaces into the empty string', () => {
    expect(normaliseIdentifier('   ')).toBe('');
  });
});

describe('identifierKind', () => {
  it.each([
    ['frieren@example.com', 'email'],
    ['@', 'email'],
    ['frieren', 'username'],
    ['', 'username'],
  ] as const)('%s is an %s', (identifier, kind) => {
    expect(identifierKind(normaliseIdentifier(identifier))).toBe(kind);
  });
});
