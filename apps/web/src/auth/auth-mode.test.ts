// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseAuthMode } from './auth-mode';

describe('parseAuthMode', () => {
  it.each(['signup', 'sign-up'])('opens sign-up for %o', (value) => {
    expect(parseAuthMode(value)).toBe('sign-up');
  });

  it.each([
    'signin',
    'sign-in',
    undefined,
    '',
    'SignUp',
    'SIGN-UP',
    ' sign-up',
    'sign_up',
    ['sign-up'],
    ['sign-up', 'sign-up'],
    42,
  ])('falls back to sign-in for %o', (value) => {
    expect(parseAuthMode(value)).toBe('sign-in');
  });
});
