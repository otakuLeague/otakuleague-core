// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
  const VISITOR = { 'x-forwarded-for': '203.0.113.7' };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const UNKNOWN = { kind: 'refused', reason: 'client_ip_unknown' };

  it.each([
    ['one address', VISITOR, { kind: 'known', clientIp: '203.0.113.7' }],
    ['no header', {}, UNKNOWN],
    ['a list', { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' }, UNKNOWN],
    // Next re-sends a Server Action between workers; that hop carries Vercel's egress address.
    // A visitor can send the header too, so it is its own reason, never reported.
    [
      'a forwarded action hop',
      { ...VISITOR, 'x-action-forwarded': '1' },
      { kind: 'refused', reason: 'action_forwarded' },
    ],
  ])('on Vercel, %s', async (_label, headers, expected) => {
    vi.stubEnv('VERCEL', '1');
    incoming.headers = new Headers(headers);

    expect(await readCredentialClientIp({ isHttps: true })).toEqual(expected);
  });

  it.each([undefined, '', '0'])(
    'off Vercel (VERCEL=%j) sends loopback and never reads a forged header',
    async (vercel) => {
      vi.stubEnv('VERCEL', vercel);
      incoming.headers = new Headers(VISITOR);
      incoming.reads = 0;

      expect(await readCredentialClientIp({ isHttps: false })).toEqual({
        kind: 'known',
        clientIp: '127.0.0.1',
      });
      expect(incoming.reads).toBe(0);
    },
  );

  it('still matches the header name Next sets on a forwarded action', () => {
    const require = createRequire(import.meta.url);
    const actionHandler = readFileSync(
      require.resolve('next/dist/server/app-render/action-handler.js'),
      'utf8',
    );

    expect(actionHandler).toContain("'x-action-forwarded'");
  });
});
