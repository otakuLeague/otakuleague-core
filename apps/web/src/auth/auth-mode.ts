export type AuthMode = 'sign-in' | 'sign-up';

const SIGN_UP_SPELLINGS: readonly unknown[] = ['signup', 'sign-up'];

/**
 * The `/auth?mode=` tab. Only the exact spellings `signup` and `sign-up` open sign-up; anything
 * else (missing, repeated, another case, `signin`, junk) is sign-in, the page's default.
 */
export function parseAuthMode(value: unknown): AuthMode {
  return SIGN_UP_SPELLINGS.includes(value) ? 'sign-up' : 'sign-in';
}
