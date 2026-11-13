// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkInternalApiKeyConfig,
  isSecureApiBaseUrl,
  readApiBaseUrl,
  readInternalApiKey,
} from './config';

describe('readApiBaseUrl', () => {
  it('returns an http or https URL as is', () => {
    expect(readApiBaseUrl({ API_BASE_URL: 'http://127.0.0.1:3001' })).toBe(
      'http://127.0.0.1:3001',
    );
    expect(
      readApiBaseUrl({ API_BASE_URL: 'https://api.otakuleague.example' }),
    ).toBe('https://api.otakuleague.example');
  });

  it('removes trailing slashes, including after a path prefix', () => {
    expect(readApiBaseUrl({ API_BASE_URL: 'http://127.0.0.1:3001/' })).toBe(
      'http://127.0.0.1:3001',
    );
    expect(
      readApiBaseUrl({ API_BASE_URL: ' https://example.com/api// ' }),
    ).toBe('https://example.com/api');
  });

  it.each([undefined, '', '   '])(
    'throws the missing message for %j',
    (value) => {
      expect(() => readApiBaseUrl({ API_BASE_URL: value })).toThrow(
        /^Invalid web configuration: API_BASE_URL is missing\. Set it in the repo-root \.env/,
      );
    },
  );

  it.each([
    'not a url',
    '127.0.0.1:3001',
    'ftp://127.0.0.1',
    'file:///etc/passwd',
    'http://127.0.0.1:3001?debug=1',
    'http://127.0.0.1:3001/#top',
  ])('throws the invalid message for %j', (value) => {
    expect(() => readApiBaseUrl({ API_BASE_URL: value })).toThrow(
      /^Invalid web configuration: API_BASE_URL is invalid\. Set it in the repo-root \.env/,
    );
  });

  it('rejects credentials in the URL without echoing them', () => {
    const readWithCredentials = () =>
      readApiBaseUrl({ API_BASE_URL: 'https://admin:s3cret@example.com' });

    expect(readWithCredentials).toThrow('API_BASE_URL is invalid');
    expect(readWithCredentials).toThrow(/^(?![\s\S]*s3cret)/);
  });

  it('rejects a username without a password, such as a token', () => {
    expect(() =>
      readApiBaseUrl({ API_BASE_URL: 'https://t0ken@example.com' }),
    ).toThrow('API_BASE_URL is invalid');
  });
});

// Obviously fake: 47 characters of the allowed alphabet, never a real key.
const FAKE_KEY = 'fake-internal-api-key-for-tests-only-0123456789';

describe('readInternalApiKey', () => {
  it.each([undefined, '', '   '])('treats %j as unset', (value) => {
    expect(readInternalApiKey({ INTERNAL_API_KEY: value })).toBeUndefined();
  });

  it.each([
    'a'.repeat(43),
    'Z'.repeat(128),
    '0123456789abcdef'.repeat(4),
    FAKE_KEY,
  ])('accepts %j', (value) => {
    expect(readInternalApiKey({ INTERNAL_API_KEY: value })).toBe(value);
  });

  it('trims surrounding whitespace, as a pasted value often has', () => {
    expect(readInternalApiKey({ INTERNAL_API_KEY: ` ${FAKE_KEY}\n` })).toBe(
      FAKE_KEY,
    );
  });

  it.each([
    ['42 characters', 'a'.repeat(42)],
    ['129 characters', 'a'.repeat(129)],
    ['base64 padding', `${'a'.repeat(43)}=`],
    ['a slash', `${'a'.repeat(43)}/`],
    ['an inner space', `${'a'.repeat(22)} ${'a'.repeat(22)}`],
    ['a header break', `${'a'.repeat(43)}\r\nx-evil: 1`],
  ])(
    'refuses %s with a message naming the variable, never the value',
    (_label, value) => {
      const read = () => readInternalApiKey({ INTERNAL_API_KEY: value });
      expect(read).toThrow(
        /^Invalid web configuration: INTERNAL_API_KEY is invalid\./,
      );
      expect(read).toThrow(/^(?![\s\S]*aaaaaaaaaa)/);
    },
  );
});

describe('isSecureApiBaseUrl', () => {
  it.each([
    'https://api.otakuleague.example',
    'https://api.otakuleague.example/v1',
    'http://127.0.0.1:3001',
    'http://[::1]:3001',
  ])('allows %j', (baseUrl) => {
    expect(isSecureApiBaseUrl(baseUrl)).toBe(true);
  });

  it.each([
    'http://api.otakuleague.example',
    'http://127.0.0.1.evil.example',
    'http://localhost:3001',
    'http://localhost.evil.example',
    'http://evil.example/127.0.0.1',
    'http://10.0.0.5:3001',
    'http://[::2]:3001',
    'ftp://127.0.0.1',
    'not a url',
  ])('refuses %j', (baseUrl) => {
    expect(isSecureApiBaseUrl(baseUrl)).toBe(false);
  });
});

describe('checkInternalApiKeyConfig (next.config.ts, fails the deploy)', () => {
  it('reads nothing when the key is unset, as before slice 2', () => {
    expect(() =>
      checkInternalApiKeyConfig({ INTERNAL_API_KEY: '', API_BASE_URL: '' }),
    ).not.toThrow();
  });

  it('accepts a valid key with an https or loopback API_BASE_URL', () => {
    for (const baseUrl of ['https://api.test', 'http://127.0.0.1:3001']) {
      expect(() =>
        checkInternalApiKeyConfig({
          INTERNAL_API_KEY: FAKE_KEY,
          API_BASE_URL: baseUrl,
        }),
      ).not.toThrow();
    }
  });

  it.each([
    [
      'an invalid key',
      'not a key',
      'https://api.test',
      'INTERNAL_API_KEY is invalid',
    ],
    [
      'a plain http API',
      FAKE_KEY,
      'http://api.test',
      'neither https nor loopback',
    ],
    ['a missing API_BASE_URL', FAKE_KEY, '', 'API_BASE_URL is missing'],
  ])('throws on %s, never echoing the key', (_label, key, baseUrl, message) => {
    const check = () =>
      checkInternalApiKeyConfig({
        INTERNAL_API_KEY: key,
        API_BASE_URL: baseUrl,
      });
    expect(check).toThrow(message);
    expect(check).toThrow(/^(?![\s\S]*fake-internal-api-key)/);
  });
});

describe('the internal key in browser code', () => {
  // Built from parts so this file does not match its own scan.
  const publicPrefix = ['NEXT', 'PUBLIC', 'INTERNAL'].join('_');
  const webDir = path.resolve(__dirname, '../..');

  function sourceFiles(): string[] {
    const nested = ['app', 'src', 'public'].flatMap((folder) =>
      readdirSync(path.join(webDir, folder), {
        recursive: true,
        encoding: 'utf8',
      }).map((file) => path.join(folder, file)),
    );
    const topLevel = readdirSync(webDir, { encoding: 'utf8' });
    return [...nested, ...topLevel].filter((file) =>
      statSync(path.join(webDir, file)).isFile(),
    );
  }

  it(`is never exposed under a ${'NEXT_PUBLIC_'} name in apps/web`, () => {
    const files = sourceFiles();
    const offenders = files.filter((file) =>
      readFileSync(path.join(webDir, file), 'utf8').includes(publicPrefix),
    );

    expect(files).toContain(path.join('src', 'api', 'config.ts'));
    expect(offenders).toEqual([]);
  });

  it('is not in the env block of next.config.ts, which Next inlines in bundles', () => {
    const nextConfig = readFileSync(
      path.join(webDir, 'next.config.ts'),
      'utf8',
    );
    const envBlock = /\n {2}env: \{\n([\s\S]*?)\n {2}\},\n/.exec(
      nextConfig,
    )?.[1];

    expect(envBlock).toContain('SENTRY_RELEASE');
    expect(envBlock).not.toContain('INTERNAL_API_KEY');
    expect(nextConfig).toContain('checkInternalApiKeyConfig(process.env);');
  });
});
