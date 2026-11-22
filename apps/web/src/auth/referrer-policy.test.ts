// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The referrer guard (ADR 0015 Addendum 1f-iv-c2): under this policy a native form POST sends
// `Origin: null`, which every auth action refuses, and the header holds the sign-out form on every
// page. Sources never spell the literal, comments included: they say "the referrer guard".
const NO_REFERRER = /no-referrer/i;
const WEB_DIR = path.resolve(__dirname, '../..');

function sourcesUnder(dir: string): string[] {
  return readdirSync(path.join(WEB_DIR, dir), {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.join(dir, file));
}

const SCANNED = [
  ...sourcesUnder('app'),
  ...sourcesUnder('src'),
  'proxy.ts',
  'next.config.ts',
];

describe('referrer guard', () => {
  it('matches the policy in any letter case, never rel="noopener noreferrer"', () => {
    expect(
      [
        'Referrer-Policy: no-referrer',
        "referrerPolicy: 'NO-REFERRER'",
        '<meta name="referrer" content="No-Referrer" />',
      ].every((text) => NO_REFERRER.test(text)),
    ).toBe(true);
    expect(NO_REFERRER.test('rel="noopener noreferrer"')).toBe(false);
  });

  it('scans the sign-in page, the account menu, the proxy and the config, never a test', () => {
    expect(SCANNED).toEqual(
      expect.arrayContaining([
        path.join('app', 'auth', 'page.tsx'),
        path.join('src', 'shell', 'viewer-actions.tsx'),
        'proxy.ts',
        'next.config.ts',
      ]),
    );
    expect(SCANNED).not.toContain(
      path.join('src', 'auth', 'referrer-policy.test.ts'),
    );
  });

  it('finds the literal in no non-test source under app/ or src/, nor in proxy.ts or next.config.ts', () => {
    const offenders = SCANNED.filter((file) =>
      NO_REFERRER.test(readFileSync(path.join(WEB_DIR, file), 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
