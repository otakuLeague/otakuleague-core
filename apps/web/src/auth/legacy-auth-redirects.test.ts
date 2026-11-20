// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseAuthMode } from './auth-mode';
import { LEGACY_AUTH_REDIRECTS } from './legacy-auth-redirects';

describe('LEGACY_AUTH_REDIRECTS', () => {
  it('sends the old /sign-in to the sign-in tab of /auth with a 308', () => {
    expect(LEGACY_AUTH_REDIRECTS).toEqual([
      {
        source: '/sign-in',
        destination: '/auth?mode=sign-in',
        permanent: true,
      },
    ]);
  });

  it.each(LEGACY_AUTH_REDIRECTS)(
    '$source lands on /auth in a mode the page reads as sign-in',
    ({ destination }) => {
      const url = new URL(destination, 'https://beta.otakuleague.com');

      expect(url.pathname).toBe('/auth');
      expect(parseAuthMode(url.searchParams.get('mode'))).toBe('sign-in');
      expect(url.searchParams.has('next')).toBe(false);
    },
  );
});
