import { COMMON_PASSWORDS } from './common-passwords/common-passwords.data';
import { normalisePassword } from './credential-rules';

/** Sign-up's refusal on the `password` field (ADR 0020 Addendum 1e-iii); never echoes the value. */
export const COMMON_PASSWORD_MESSAGE = 'password is too common';

/** Built once at import: no file read, no network call. Every entry is already NFC lower-case. */
const COMMON_PASSWORD_SET: ReadonlySet<string> = new Set(COMMON_PASSWORDS);

/**
 * ADR 0020 Addendum (1e-iii) decision 5: NFC, then `toLowerCase()`, then a whole-string lookup.
 * No trim (a space is part of a password), no substring or leet matching. It depends on the
 * input alone, so it cannot tell a new email from a registered one (N1).
 */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORD_SET.has(normalisePassword(password).toLowerCase());
}
