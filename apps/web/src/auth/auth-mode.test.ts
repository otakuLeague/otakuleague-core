// @vitest-environment node
import { expect, it } from 'vitest';
import { parseAuthMode } from './auth-mode';

it.each(['signup', 'sign-up'])('opens sign-up for %o', (value) => {
  expect(parseAuthMode(value)).toBe('sign-up');
});

it.each([
  'signin',
  'sign-in',
  undefined,
  '',
  'SIGN-UP',
  ' sign-up',
  ['sign-up'],
])('falls back to sign-in for %o', (value) => {
  expect(parseAuthMode(value)).toBe('sign-in');
});
