// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWebPublicUrl } from '../auth/web-public-url';
import {
  clientIpFromHeaders,
  readClientIp,
  readCredentialClientIp,
} from './client-ip';

const incoming = vi.hoisted(() => ({ headers: new Headers(), reads: 0 }));
vi.mock('next/headers', () => ({
  headers: () => {
    incoming.reads += 1;
    return Promise.resolve(incoming.headers);
  },
}));

const forwardedFor = (value: string) =>
  clientIpFromHeaders(new Headers({ 'x-forwarded-for': value }));

describe('clientIpFromHeaders', () => {
  it.each([
    ['an IPv4 address', '203.0.113.7'],
    ['an IPv6 address', '2001:db8::7'],
    ['an IPv4-mapped IPv6 address', '::ffff:203.0.113.7'],
  ])('accepts %s', (_label, value) => {
    expect(forwardedFor(value)).toBe(value);
  });

  it('trims the surrounding whitespace', () => {
    expect(forwardedFor('  203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('gives nothing without x-forwarded-for', () => {
    expect(clientIpFromHeaders(new Headers())).toBeUndefined();
  });

  it.each([
    ['an empty value', ''],
    ['a list, which Vercel never sends', '203.0.113.7, 198.51.100.1'],
    ['an address with a port', '203.0.113.7:443'],
    ['a bracketed IPv6 address', '[2001:db8::7]'],
    ['an IPv6 zone id', 'fe80::1%eth0'],
    ['a leading zero', '203.0.113.07'],
    ['text', 'unknown'],
    ['a long value', '1'.repeat(10_000)],
  ])('refuses %s', (_label, value) => {
    expect(forwardedFor(value)).toBeUndefined();
  });

  it('never reads a header the visitor could set instead', () => {
    const spoofable = new Headers({
      'x-real-ip': '203.0.113.7',
      forwarded: 'for=203.0.113.7',
      'true-client-ip': '203.0.113.7',
      'cf-connecting-ip': '203.0.113.7',
      'x-client-ip': '203.0.113.7',
    });

    expect(clientIpFromHeaders(spoofable)).toBeUndefined();
  });
});

describe('readClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads x-forwarded-for from the incoming request on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    incoming.headers = new Headers({ 'x-forwarded-for': '2001:db8::7' });
    expect(await readClientIp()).toBe('2001:db8::7');

    incoming.headers = new Headers();
    expect(await readClientIp()).toBeUndefined();
  });

  it.each([undefined, '', '0', 'true'])(
    'gives nothing off Vercel (VERCEL=%j): anyone could set the header there',
    async (vercel) => {
      vi.stubEnv('VERCEL', vercel);
      incoming.headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });

      expect(await readClientIp()).toBeUndefined();
    },
  );
});

describe('readCredentialClientIp', () => {
  const HTTPS_WEB = parseWebPublicUrl('https://beta.otakuleague.com');
  const LOOPBACK_WEB = parseWebPublicUrl('http://localhost:3000');

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['one address', '203.0.113.7', '203.0.113.7'],
    ['no header', undefined, undefined],
    ['a list', '203.0.113.7, 198.51.100.1', undefined],
  ])('on Vercel reads x-forwarded-for: %s', async (_label, value, expected) => {
    vi.stubEnv('VERCEL', '1');
    incoming.headers = new Headers(
      value === undefined ? {} : { 'x-forwarded-for': value },
    );

    expect(await readCredentialClientIp(HTTPS_WEB)).toBe(expected);
  });

  it.each([undefined, '', '0'])(
    'off Vercel (VERCEL=%j) sends loopback and never reads a forged header',
    async (vercel) => {
      vi.stubEnv('VERCEL', vercel);
      incoming.headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });
      incoming.reads = 0;

      expect(await readCredentialClientIp(LOOPBACK_WEB)).toBe('127.0.0.1');
      expect(incoming.reads).toBe(0);
    },
  );

  it('gives nothing to an https web off Vercel, which cannot know the visitor', async () => {
    vi.stubEnv('VERCEL', '');
    incoming.headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });

    expect(await readCredentialClientIp(HTTPS_WEB)).toBeUndefined();
  });
});
