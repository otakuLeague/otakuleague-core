// @vitest-environment node
import { expect, it } from 'vitest';
import { parseAuthMode } from './auth-mode';
import { LEGACY_AUTH_REDIRECTS } from './legacy-auth-redirects';

it('sends the old /sign-in to the sign-in mode of /auth with a 308', () => {
  expect(LEGACY_AUTH_REDIRECTS).toEqual([
    { source: '/sign-in', destination: '/auth?mode=sign-in', permanent: true },
  ]);
  const mode = new URL(
    LEGACY_AUTH_REDIRECTS[0]?.destination ?? '',
    'https://x',
  );
  expect(parseAuthMode(mode.searchParams.get('mode'))).toBe('sign-in');
});
