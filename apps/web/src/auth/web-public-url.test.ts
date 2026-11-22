// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isSameOrigin,
  parseWebPublicUrl,
  readWebPublicUrl,
} from './web-public-url';

describe('parseWebPublicUrl', () => {
  it.each([
    ['https://beta.otakuleague.com', 'https://beta.otakuleague.com'],
    ['https://beta.otakuleague.com/', 'https://beta.otakuleague.com'],
    ['  https://otakuleague.com:8443  ', 'https://otakuleague.com:8443'],
  ])('accepts https %s', (raw, origin) => {
    expect(parseWebPublicUrl(raw)).toEqual({ origin, isHttps: true });
  });

  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
  ])('accepts http on loopback %s', (raw, origin) => {
    expect(parseWebPublicUrl(raw)).toEqual({ origin, isHttps: false });
  });

  it.each([undefined, '', '   '])('names the missing variable (%j)', (raw) => {
    expect(() => parseWebPublicUrl(raw)).toThrow(
      /^Invalid web configuration: WEB_PUBLIC_URL is missing\./,
    );
  });

  it.each([
    ['http off loopback', 'http://beta.otakuleague.com'],
    ['a look-alike loopback name', 'http://localhost.evil.example'],
    ['a look-alike loopback address', 'http://127.0.0.1.evil.example'],
    ['a path', 'https://beta.otakuleague.com/app'],
    ['a double slash path', 'https://beta.otakuleague.com//'],
    ['a query', 'https://beta.otakuleague.com/?next=/x'],
    ['an empty query', 'https://beta.otakuleague.com/?'],
    ['a fragment', 'https://beta.otakuleague.com/#top'],
    ['an empty fragment', 'https://beta.otakuleague.com#'],
    ['credentials', 'https://farouk:secret-value@beta.otakuleague.com'],
    ['a username only', 'https://secret-value@beta.otakuleague.com'],
    ['another scheme', 'ftp://beta.otakuleague.com'],
    ['javascript', 'javascript:alert(1)'],
    ['no scheme', 'beta.otakuleague.com'],
    ['a relative path', '/auth'],
    ['a dot segment', 'https://example.com/.'],
    ['no slashes after the scheme', 'https:example.com'],
    ['a trailing-dot host', 'https://example.com./'],
    ['a default port', 'https://example.com:443'],
  ])('refuses %s without echoing the value', (_label, raw) => {
    let message = '';
    try {
      parseWebPublicUrl(raw);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toMatch(
      /^Invalid web configuration: WEB_PUBLIC_URL is invalid\./,
    );
    expect(message).not.toContain(raw);
    expect(message).not.toContain('secret-value');
  });
});

describe('readWebPublicUrl', () => {
  it('reads WEB_PUBLIC_URL from the given environment', () => {
    expect(
      readWebPublicUrl({ WEB_PUBLIC_URL: 'https://beta.otakuleague.com' }),
    ).toEqual({ origin: 'https://beta.otakuleague.com', isHttps: true });
  });

  it('throws when it is unset, as on a Vercel preview', () => {
    expect(() => readWebPublicUrl({})).toThrow('WEB_PUBLIC_URL is missing');
  });

  it('refuses loopback http on Vercel, and keeps https there', () => {
    expect(() =>
      readWebPublicUrl({
        VERCEL: '1',
        WEB_PUBLIC_URL: 'http://localhost:3000',
      }),
    ).toThrow(/^Invalid web configuration: WEB_PUBLIC_URL is invalid\./);
    expect(
      readWebPublicUrl({
        VERCEL: '1',
        WEB_PUBLIC_URL: 'https://beta.otakuleague.com/',
      }),
    ).toEqual({ origin: 'https://beta.otakuleague.com', isHttps: true });
  });
});

describe('isSameOrigin', () => {
  const webPublicUrl = parseWebPublicUrl('https://beta.otakuleague.com');

  it('accepts exactly our origin', () => {
    expect(isSameOrigin('https://beta.otakuleague.com', webPublicUrl)).toBe(
      true,
    );
  });

  it.each([
    null,
    'null',
    '',
    'https://evil.com',
    'http://beta.otakuleague.com',
    'https://beta.otakuleague.com/',
    'https://beta.otakuleague.com.evil.com',
    'https://BETA.otakuleague.com',
  ])('refuses %o', (originHeader) => {
    expect(isSameOrigin(originHeader, webPublicUrl)).toBe(false);
  });
});
