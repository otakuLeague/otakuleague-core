// @vitest-environment node
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Every route handler under app/ and its exports, pinned (ADR 0015 Addendum 1f-vi decision 2):
// until the CSRF walker of OTA-142 exists, a new handler or method fails here first, so its
// origin check and its redirects are decided before it ships.
const APP_DIR = __dirname;
const ROUTE_FILE = /^route\.[cm]?[jt]sx?$/;

function routeFilesUnder(dir: string): string[] {
  return readdirSync(path.join(APP_DIR, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return routeFilesUnder(file);
      return ROUTE_FILE.test(entry.name) ? [file] : [];
    },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('route handlers under app/', () => {
  it('are exactly the Sentry tunnel and the email link', () => {
    expect(routeFilesUnder('').sort()).toEqual([
      'auth/verify/route.ts',
      'hikari/route.ts',
    ]);
  });

  it('export only their pinned methods', async () => {
    expect(Object.keys(await import('./auth/verify/route'))).toEqual(['GET']);
    expect(Object.keys(await import('./hikari/route'))).toEqual(['POST']);
  });

  it('serve the email link at EMAIL_VERIFICATION_LINK.path, through verifyEmailLink', async () => {
    expect(EMAIL_VERIFICATION_LINK.path).toBe('/auth/verify');
    expect(routeFilesUnder('')).toContain(
      `${EMAIL_VERIFICATION_LINK.path.slice(1)}/route.ts`,
    );
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { GET } = await import('./auth/verify/route');

    const response = await GET(
      new Request(
        `https://beta.otakuleague.com${EMAIL_VERIFICATION_LINK.path}?${EMAIL_VERIFICATION_LINK.tokenParam}=${'A'.repeat(43)}`,
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/auth');
  });
});
