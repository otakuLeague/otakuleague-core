import { meetsSignUpPasswordRule } from '@otakuleague/shared-types';

/** Why a hydrated sign-up submit stops in the browser, or `none` (ADR 0015 Addendum v3b). */
export type SignUpSubmitBlock = 'none' | 'rules_unmet' | 'confirm_mismatch';

/**
 * The gate, read from the two inputs at submit, never from the checklist. The rules come first
 * (field order); the confirmation must equal the password as typed, so two Unicode spellings of
 * one password differ here although the API would accept either.
 */
export function signUpSubmitBlock(
  password: string,
  confirm: string,
): SignUpSubmitBlock {
  if (!meetsSignUpPasswordRule(password)) return 'rules_unmet';
  if (password !== confirm) return 'confirm_mismatch';
  return 'none';
}
