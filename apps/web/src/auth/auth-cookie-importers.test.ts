// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The auth cookie import gate (ADR 0015 Addendum 1f-vi decision 7, N39): a source scan, not lint,
// so it also sees an alias, a namespace import, `import()` and a comment. A new writer or reader
// of these cookies changes this table in review. Same walk as the referrer guard.
const WEB_DIR = path.resolve(__dirname, '../..');
const SKIPPED_DIRS = new Set(['node_modules', '.next']);
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

function filesUnder(dir: string): string[] {
  return readdirSync(path.join(WEB_DIR, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : filesUnder(file);
      }
      return entry.isFile() ? [file] : [];
    },
  );
}

const SOURCES = filesUnder('')
  .filter((file) => SOURCE_FILE.test(file) && !TEST_FILE.test(file))
  .map((file) => ({ file, text: readFileSync(path.join(WEB_DIR, file), 'utf8') }));

const DEFINITION = 'src/auth/auth-cookies.ts';
const SIGN_UP_ACTION = 'src/auth/sign-up-action.ts';
const VERIFY_EMAIL_LINK = 'src/auth/verify-email-link.ts';
const FLASH_EMAIL = 'src/auth/flash-email.ts';

const PINNED: Readonly<Record<string, readonly string[]>> = {
  signUpCookie: [DEFINITION, SIGN_UP_ACTION, VERIFY_EMAIL_LINK],
  clearedSignUpCookie: [DEFINITION, VERIFY_EMAIL_LINK],
  verifyCookie: [DEFINITION, VERIFY_EMAIL_LINK],
  flashCookie: [DEFINITION, FLASH_EMAIL, SIGN_UP_ACTION],
};

const filesNaming = (helper: string) =>
  SOURCES.filter(({ text }) => new RegExp(`\\b${helper}\\b`).test(text))
    .map(({ file }) => file)
    .sort();

// The cookie names themselves: a hand-built `cookies().get('__Host-ol_verify')` or a second
// `authCookie('ol_signup', …)` skips the helpers. Comments count; prose says "the binding".
const PRIVACY = 'src/legal/privacy.tsx';
const EMAIL_LINK = 'src/auth/email-link.ts';
const PINNED_NAMES: Readonly<Record<string, readonly string[]>> = {
  ol_signup: [DEFINITION, EMAIL_LINK, PRIVACY, SIGN_UP_ACTION, VERIFY_EMAIL_LINK],
  ol_verify: [DEFINITION, PRIVACY, VERIFY_EMAIL_LINK],
  ol_flash: [DEFINITION, FLASH_EMAIL, PRIVACY, SIGN_UP_ACTION],
};

const filesHolding = (literal: string) =>
  SOURCES.filter(({ text }) => text.includes(literal))
    .map(({ file }) => file)
    .sort();

describe('auth cookie import gate', () => {
  it('scans the sources of apps/web, never a test or build output', () => {
    const files = SOURCES.map(({ file }) => file);

    expect(files).toEqual(
      expect.arrayContaining([DEFINITION, SIGN_UP_ACTION, 'proxy.ts']),
    );
    expect(files.filter((file) => TEST_FILE.test(file))).toEqual([]);
    expect(
      files.filter((file) =>
        file.split('/').some((part) => SKIPPED_DIRS.has(part)),
      ),
    ).toEqual([]);
  });

  it.each(Object.entries(PINNED))(
    'finds %s only in its pinned files',
    (helper, files) => {
      expect(filesNaming(helper)).toEqual([...files].sort());
    },
  );

  it('pins 4 files in all, the definition included', () => {
    expect(new Set(Object.values(PINNED).flat()).size).toBe(4);
  });

  it.each(Object.entries(PINNED_NAMES))(
    'finds the cookie name %s only in its pinned files',
    (literal, files) => {
      expect(filesHolding(literal)).toEqual([...files].sort());
    },
  );
});
