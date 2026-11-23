// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { signUpSubmitBlock } from './sign-up-password-checks';

const COMBINING_ACUTE = String.fromCodePoint(0x301);
const E_ACUTE = String.fromCodePoint(0xe9);

describe('signUpSubmitBlock', () => {
  it('lets a password that meets both rules and equals its confirmation through', () => {
    expect(signUpSubmitBlock('secret-pass-1', 'secret-pass-1')).toBe('none');
  });

  it.each([
    ['too short', 'abc1', 'abc1'],
    ['no digit or symbol', 'abcdefghij', 'abcdefghij'],
    ['empty on both sides', '', ''],
  ])('blocks a password that misses a rule (%s)', (_, password, confirm) => {
    expect(signUpSubmitBlock(password, confirm)).toBe('rules_unmet');
  });

  it('names the rules before a mismatch (field order)', () => {
    expect(signUpSubmitBlock('abc1', 'abc2')).toBe('rules_unmet');
    expect(signUpSubmitBlock('abc1', '')).toBe('rules_unmet');
  });

  it.each([
    ['another password', 'secret-pass-2'],
    ['an empty confirmation', ''],
    ['a trailing space', 'secret-pass-1 '],
    ['another letter case', 'SECRET-PASS-1'],
  ])('blocks a confirmation that differs: %s', (_, confirm) => {
    expect(signUpSubmitBlock('secret-pass-1', confirm)).toBe(
      'confirm_mismatch',
    );
  });

  it('compares the raw values: another Unicode spelling is a mismatch', () => {
    const composed = `caf${E_ACUTE}-pass-1`;
    const decomposed = `cafe${COMBINING_ACUTE}-pass-1`;

    expect(signUpSubmitBlock(composed, decomposed)).toBe('confirm_mismatch');
  });
});
