import { describe, expect, it } from 'vitest';
import {
  type ApiCaller,
  callerOf,
  ipv6SiteKeyOf,
  OPEN_CALLER,
  PREVIEW_CALLER,
  PREVIEW_VISITOR_KEY,
  recordCaller,
  sharedVisitorBucket,
  UNKNOWN_VISITOR_KEY,
  type VisitorKey,
  visitorKeyFromClientIp,
  visitorKeyOf,
} from './api-caller';

// Documentation ranges only (RFC 5737, RFC 3849): never a real visitor's address.
describe('visitorKeyFromClientIp', () => {
  it.each([
    ['a plain IPv4', '203.0.113.7', '203.0.113.7'],
    ['the lowest IPv4', '0.0.0.0', '0.0.0.0'],
    ['a mapped IPv4, dotted', '::ffff:203.0.113.7', '203.0.113.7'],
    ['a mapped IPv4, upper-case dotted', '::FFFF:203.0.113.7', '203.0.113.7'],
    ['a mapped IPv4, hex', '::ffff:cb00:7107', '203.0.113.7'],
    ['a mapped IPv4, written out', '0:0:0:0:0:ffff:cb00:7107', '203.0.113.7'],
    [
      'a mapped IPv4, zero-padded',
      '0000:0000:0000:0000:0000:FFFF:203.0.113.7',
      '203.0.113.7',
    ],
    ['an IPv6, compressed', '2001:db8:1:2::9', '2001:db8:1:2::/64'],
    ['an IPv6, upper case', '2001:DB8:1:2::9', '2001:db8:1:2::/64'],
    ['an IPv6, written out', '2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    [
      'an IPv6, zero-padded',
      '2001:0db8:0001:0002:ffff:ffff:ffff:ffff',
      '2001:db8:1:2::/64',
    ],
    [
      'an IPv6 with an IPv4 tail',
      '2001:db8:1:2:3:4:1.2.3.4',
      '2001:db8:1:2::/64',
    ],
    ['an IPv6 compressed in its prefix', '2001:db8::1', '2001:db8:0:0::/64'],
    ['an IPv6 compressed at the end', '2001:db8:0:0:1::', '2001:db8:0:0::/64'],
    ['an IPv6 ending in ::', '1:2:3:4:5:6:7::', '1:2:3:4::/64'],
    ['the IPv6 loopback', '::1', '0:0:0:0::/64'],
    ['the unspecified IPv6', '::', '0:0:0:0::/64'],
    ['an IPv4-compatible IPv6 (not mapped)', '::1.2.3.4', '0:0:0:0::/64'],
  ])('keys %s (%s) as %s', (_, header, key) => {
    expect(visitorKeyFromClientIp(header)).toBe(key);
  });

  // The same table runs in apps/web/src/api/client-ip.test.ts against clientNetworkOf.
  it.each<[string, string]>([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:cb00:7107', '203.0.113.7'],
    ['0:0:0:0:0:ffff:cb00:7107', '203.0.113.7'],
    ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
    ['2001:DB8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:3:4:1.2.3.4', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['1:2:3:4:5:6:7::', '1:2:3:4::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::', '0:0:0:0::/64'],
    ['::1.2.3.4', '0:0:0:0::/64'],
  ])('cuts %s to %s like the web copy', (header, key) => {
    expect(visitorKeyFromClientIp(header)).toBe(key);
  });

  it.each<[string, unknown]>([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['a repeated header (array)', ['203.0.113.7', '203.0.113.8']],
    ['a one-entry array', ['203.0.113.7']],
    ['a number', 42],
    ['null', null],
    ['a list of IPv4', '203.0.113.7, 198.51.100.1'],
    ['a list without a space', '203.0.113.7,198.51.100.1'],
    ['a list of IPv6', '2001:db8::1, 2001:db8::2'],
    ['an IPv6 with a zone id', 'fe80::1%eth0'],
    ['an IPv6 with an encoded zone id', 'fe80::1%25eth0'],
    ['a bracketed IPv6', '[2001:db8::1]'],
    ['a bracketed IPv6 with a port', '[2001:db8::1]:443'],
    ['an IPv4 with a port', '203.0.113.7:443'],
    ['an IPv4 with a leading zero', '203.000.113.7'],
    ['an IPv4 with a leading zero in front', '01.2.3.4'],
    ['a mapped IPv4 with a leading zero', '::ffff:01.2.3.4'],
    ['an IPv4 out of range', '256.1.1.1'],
    ['a short IPv4', '1.2.3'],
    ['a hex IPv4', '0x7f.0.0.1'],
    ['an IPv4 with a space before it', ' 203.0.113.7'],
    ['an IPv4 with a space after it', '203.0.113.7 '],
    ['an IPv6 with a space after it', '2001:db8::1 '],
    ['an IPv6 with nine groups', '1:2:3:4:5:6:7:8:9'],
    ['an IPv6 with a five-digit group', '00001::'],
    ['text', 'localhost'],
    ['the shared key itself', 'unknown'],
    ['an over-long value', '2'.repeat(10_000)],
  ])('keys %s as the shared `unknown`', (_, header) => {
    expect(visitorKeyFromClientIp(header)).toBe(UNKNOWN_VISITOR_KEY);
  });

  it('gives two hosts of one /64 the same key and the next /64 another', () => {
    const home = visitorKeyFromClientIp('2001:db8:aa:bb:1:2:3:4');

    expect(visitorKeyFromClientIp('2001:db8:aa:bb:ffff::1')).toBe(home);
    expect(visitorKeyFromClientIp('2001:db8:aa:bc:1:2:3:4')).not.toBe(home);
  });

  it('gives a mapped IPv4 the key of the plain IPv4, and a neighbour another', () => {
    expect(visitorKeyFromClientIp('::ffff:198.51.100.20')).toBe(
      visitorKeyFromClientIp('198.51.100.20'),
    );
    expect(visitorKeyFromClientIp('198.51.100.21')).not.toBe(
      visitorKeyFromClientIp('198.51.100.20'),
    );
  });
});

describe('ipv6SiteKeyOf', () => {
  const siteOf = (header: string) =>
    ipv6SiteKeyOf(visitorKeyFromClientIp(header));

  it('gives two /64s of one /48 the same site, and another /48 another', () => {
    const site = siteOf('2001:db8:aa:1::9');

    expect(site).toBe('2001:db8:aa::/48');
    expect(siteOf('2001:db8:aa:ffff:1:2:3:4')).toBe(site);
    expect(siteOf('2001:db8:ab:1::9')).not.toBe(site);
  });

  it('keeps zero groups in the /48, like the /64 key it comes from', () => {
    const visitorKey = visitorKeyFromClientIp('2001:db8:0:5::1');

    expect(visitorKey).toBe('2001:db8:0:5::/64');
    expect(ipv6SiteKeyOf(visitorKey)).toBe('2001:db8:0::/48');
    expect(siteOf('::1')).toBe('0:0:0::/48');
  });

  it('reads the raw header through visitorKeyFromClientIp: padding and case give one site', () => {
    expect(siteOf('2001:0DB8:00AA:0001:FFFF:FFFF:FFFF:FFFF')).toBe(
      '2001:db8:aa::/48',
    );
  });

  it.each<[string, VisitorKey]>([
    ['an IPv4', visitorKeyFromClientIp('203.0.113.7')],
    ['a mapped IPv4', visitorKeyFromClientIp('::ffff:203.0.113.7')],
    ['the shared `unknown`', visitorKeyFromClientIp('not-an-ip')],
    ['the shared `preview`', PREVIEW_VISITOR_KEY],
  ])('has no site for %s', (_, visitorKey) => {
    expect(ipv6SiteKeyOf(visitorKey)).toBeNull();
  });
});

describe('visitorKeyOf', () => {
  it('has no visitor key for an open caller', () => {
    expect(visitorKeyOf(OPEN_CALLER)).toBeNull();
  });

  it('uses the web caller visitor key', () => {
    const visitorKey = visitorKeyFromClientIp('203.0.113.7');

    expect(visitorKeyOf({ kind: 'web', visitorKey })).toBe(visitorKey);
  });

  it('puts every preview in the one preview bucket, which no client IP can name', () => {
    expect(visitorKeyOf(PREVIEW_CALLER)).toBe('preview');
    expect(visitorKeyFromClientIp('preview')).toBe(UNKNOWN_VISITOR_KEY);
  });
});

describe('callerOf', () => {
  it('returns the caller recorded for this request only', () => {
    const request = {};
    const other = {};
    const caller: ApiCaller = {
      kind: 'web',
      visitorKey: visitorKeyFromClientIp('203.0.113.7'),
    };
    recordCaller(request, caller);
    recordCaller(other, OPEN_CALLER);

    expect(callerOf(request)).toBe(caller);
    expect(callerOf(other)).toBe(OPEN_CALLER);
  });

  it('throws, never assumes an open caller, when the guard recorded none', () => {
    expect(() => callerOf({})).toThrow('No ApiCaller recorded');
  });
});

describe('sharedVisitorBucket', () => {
  it('names the preview and unknown buckets and nothing else', () => {
    expect(sharedVisitorBucket(PREVIEW_VISITOR_KEY)).toBe('preview');
    expect(sharedVisitorBucket(visitorKeyFromClientIp(undefined))).toBe(
      'unknown',
    );
    expect(
      sharedVisitorBucket(visitorKeyFromClientIp('203.0.113.7')),
    ).toBeNull();
    expect(
      sharedVisitorBucket(visitorKeyFromClientIp('2001:db8:1:2::9')),
    ).toBeNull();
  });
});
