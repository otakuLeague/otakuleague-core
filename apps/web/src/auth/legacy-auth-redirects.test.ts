// @vitest-environment node
import { expect, it } from 'vitest';
import { parseAuthMode } from './auth-mode';
import { LEGACY_AUTH_REDIRECTS } from './legacy-auth-redirects';

it('sends the old /sign-in and /sign-up to their mode of /auth with a 308', () => {
  expect(LEGACY_AUTH_REDIRECTS).toEqual([
    { source: '/sign-in', destination: '/auth?mode=sign-in', permanent: true },
    { source: '/sign-up', destination: '/auth?mode=sign-up', permanent: true },
  ]);
  expect(
    LEGACY_AUTH_REDIRECTS.map(({ destination }) =>
      parseAuthMode(new URL(destination, 'https://x').searchParams.get('mode')),
    ),
  ).toEqual(['sign-in', 'sign-up']);
});
