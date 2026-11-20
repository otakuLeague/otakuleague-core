export type AuthMode = 'sign-in' | 'sign-up';

/**
 * The `/auth?mode=` tab. Only the exact spellings `signup` and `sign-up` open sign-up; anything
 * else (missing, repeated, another case, `signin`, junk) is sign-in, the page's default.
 */
export function parseAuthMode(value: unknown): AuthMode {
  return value === 'signup' || value === 'sign-up' ? 'sign-up' : 'sign-in';
}
