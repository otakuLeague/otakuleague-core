// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readApiBaseUrl } from './config';

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
