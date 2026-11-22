import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  meetsSignUpPasswordRule,
  PASSWORD_MIN,
  signUpPasswordRules,
} from '@otakuleague/shared-types';

// Built from code points: an editor that normalises a pasted accent would silently change a case.
const COMBINING_ACUTE = String.fromCodePoint(0x301);

void describe('PASSWORD_MIN (ADR 0015)', () => {
  void it('pins the shortest sign-up password the API and the web share', () => {
    assert.equal(PASSWORD_MIN, 8);
  });
});

// The API's cases (sign-up-rules.spec.ts until ADR 0015 Addendum v3b), unchanged.
void describe('meetsSignUpPasswordRule', () => {
  for (const [name, password] of [
    ['8 with a digit', 'abcdefg1'],
    ['8 with punctuation', 'abcdefg!'],
    ['8 with a symbol', 'abcdefg+'],
    ['8 with an emoji', `abcdefg${String.fromCodePoint(0x1f642)}`],
    ['8 code points after NFC from 9 units', `abcdefe${COMBINING_ACUTE}1`],
  ] as const) {
    void it(`accepts ${name}`, () => {
      assert.equal(meetsSignUpPasswordRule(password), true);
    });
  }

  for (const [name, password] of [
    ['7 with a digit', 'abcdef1'],
    ['letters only', 'abcdefghij'],
    ['letters and spaces only', 'abcd efgh ijkl'],
    ['letters and a combining mark only', `abcdefgh${COMBINING_ACUTE}`],
    ['7 code points after NFC from 8 units', `abcdee${COMBINING_ACUTE}1`],
    ['nothing', ''],
  ] as const) {
    void it(`refuses ${name}`, () => {
      assert.equal(meetsSignUpPasswordRule(password), false);
    });
  }
});

void describe('signUpPasswordRules', () => {
  for (const [name, password, longEnough, hasDigitOrSymbol] of [
    ['nothing', '', false, false],
    ['7 letters', 'abcdefg', false, false],
    ['8 letters', 'abcdefgh', true, false],
    ['7 with a digit', 'abcdef1', false, true],
    ['8 with a digit', 'abcdefg1', true, true],
    [
      '8 UTF-16 units that NFC makes 7',
      `abcdee${COMBINING_ACUTE}x`,
      false,
      false,
    ],
    ['a lone symbol', '#', false, true],
    ['8 spaces', ' '.repeat(8), true, false],
  ] as const) {
    void it(`judges each rule apart for ${name}`, () => {
      assert.deepEqual(signUpPasswordRules(password), {
        longEnough,
        hasDigitOrSymbol,
      });
    });
  }

  void it('agrees with meetsSignUpPasswordRule: both rules, never one', () => {
    for (const password of [
      '',
      'abcdefgh',
      'abcdef1',
      'abcdefg1',
      '12345678',
    ]) {
      const rules = signUpPasswordRules(password);
      assert.equal(
        meetsSignUpPasswordRule(password),
        rules.longEnough && rules.hasDigitOrSymbol,
        password,
      );
    }
  });
});
