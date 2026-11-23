// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The referrer guard (ADR 0015 Addendum 1f-iv-c2): under this policy a native form POST sends
// `Origin: null`, which every auth action refuses, and the header holds the sign-out form on every
// page. Sources never spell the literal, comments included: they say "the referrer guard". The
// second pattern is the legacy meta value with the same effect, quoted, a few lines after "referrer".
const NO_REFERRER_PATTERNS = [
  /no-referrer/i,
  /referrer[\s\S]{0,80}?['"`]never['"`]/i,
];
const WEB_DIR = path.resolve(__dirname, '../..');
const SKIPPED_DIRS = new Set(['node_modules', '.next']);
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

const holdsNoReferrer = (text: string) =>
  NO_REFERRER_PATTERNS.some((pattern) => pattern.test(text));

/** Every file under `dir` (relative to apps/web), whatever its extension, build output skipped. */
function filesUnder(dir: string): string[] {
  return readdirSync(path.join(WEB_DIR, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : filesUnder(file);
      }
      return entry.isFile() ? [file] : [];
    },
  );
}

const SCANNED = filesUnder('').filter(
  (file) => !TEST_FILE.test(file) && !file.endsWith('.tsbuildinfo'),
);

// The one exception (ADR 0015 Addendum 1f-vi decision 3): the email link handler's bodiless 303,
// which no document or form inherits. The literal appears there exactly once.
const SEE_OTHER = path.join('src', 'auth', 'see-other.ts');

describe('referrer guard', () => {
  it('matches the policy in any letter case and its legacy value, never rel="noopener noreferrer"', () => {
    const matching = [
      'Referrer-Policy: no-referrer',
      "referrerPolicy: 'NO-REFERRER'",
      '<meta name="referrer" content="No-Referrer" />',
      '<meta name="referrer" content="never" />',
      "{\n  key: 'Referrer-Policy',\n  value: 'Never',\n}",
    ];
    const harmless = [
      'rel="noopener noreferrer"',
      'the referrer guard never sees a test',
      "referrerPolicy: 'strict-origin-when-cross-origin'",
    ];

    expect(matching.filter((text) => !holdsNoReferrer(text))).toEqual([]);
    expect(harmless.filter(holdsNoReferrer)).toEqual([]);
  });

  it('scans every source of apps/web, never a test or build output', () => {
    expect(SCANNED).toEqual(
      expect.arrayContaining([
        path.join('app', 'auth', 'page.tsx'),
        path.join('src', 'shell', 'viewer-actions.tsx'),
        'proxy.ts',
        'next.config.ts',
        'instrumentation.ts',
        'instrumentation-client.ts',
        'eslint.config.mjs',
      ]),
    );
    expect(
      SCANNED.filter(
        (file) =>
          TEST_FILE.test(file) ||
          file.split(path.sep).some((part) => SKIPPED_DIRS.has(part)),
      ),
    ).toEqual([]);
  });

  it('finds the policy in no non-test file of apps/web but the 303 helper, comments included', () => {
    const offenders = SCANNED.filter(
      (file) =>
        file !== SEE_OTHER &&
        holdsNoReferrer(readFileSync(path.join(WEB_DIR, file), 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('finds the literal exactly once in the 303 helper, and never the legacy value', () => {
    const text = readFileSync(path.join(WEB_DIR, SEE_OTHER), 'utf8');

    expect(SCANNED).toContain(SEE_OTHER);
    expect(text.match(/no-referrer/gi)).toEqual(['no-referrer']);
    expect(NO_REFERRER_PATTERNS[1]?.test(text)).toBe(false);
  });
});
