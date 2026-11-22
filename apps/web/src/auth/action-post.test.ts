// @vitest-environment node
// eslint-disable-next-line no-restricted-syntax -- the parity test calls Next's own rule (ADR 0015 Addendum OTA-207, decision 2); it loads no redirect.
import { getIsPossibleServerAction } from 'next/dist/server/lib/server-action-request-meta';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isCrossSitePost, isPossibleActionPost } from './action-post';

const request = (method: string, headers: Record<string, string>) =>
  new NextRequest('https://otakuleague.com/any/path', { method, headers });

describe('isPossibleActionPost', () => {
  it.each<[string, string, Record<string, string>, boolean]>([
    ['an action fetch', 'POST', { 'next-action': 'a1b2' }, true],
    ['an empty action id', 'POST', { 'next-action': '' }, true],
    [
      'a no-JS form',
      'POST',
      { 'content-type': 'multipart/form-data; boundary=x' },
      true,
    ],
    [
      'a url-encoded form',
      'POST',
      { 'content-type': 'application/x-www-form-urlencoded' },
      true,
    ],
    [
      'a url-encoded form with a charset',
      'POST',
      { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      false,
    ],
    [
      'upper-case multipart',
      'POST',
      { 'content-type': 'Multipart/form-data' },
      false,
    ],
    [
      'the Sentry tunnel',
      'POST',
      { 'content-type': 'text/plain;charset=UTF-8' },
      false,
    ],
    ['a JSON handler', 'POST', { 'content-type': 'application/json' }, false],
    ['a bare POST', 'POST', {}, false],
    ['a GET with an action id', 'GET', { 'next-action': 'a1b2' }, false],
    ['a PUT form', 'PUT', { 'content-type': 'multipart/form-data' }, false],
    ['a lower-case post', 'post', { 'next-action': 'a1b2' }, true],
  ])('%s: %o, as Next decides', (_label, method, headers, expected) => {
    const incoming = request(method, headers);

    expect(isPossibleActionPost(incoming)).toBe(expected);
    expect(getIsPossibleServerAction(incoming)).toBe(expected);
  });
});

describe('isCrossSitePost', () => {
  const SAME = {
    host: 'otakuleague.com',
    origin: 'https://otakuleague.com',
    'sec-fetch-site': 'same-origin',
  };

  it.each<[string, Record<string, string>]>([
    ['a same-origin form', SAME],
    ['no Sec-Fetch-Site', { host: SAME.host, origin: SAME.origin }],
    ['no Origin (a script)', { host: SAME.host }],
    [
      'the forwarded host first',
      { ...SAME, host: 'internal', 'x-forwarded-host': 'otakuleague.com, x' },
    ],
  ])('lets %s through', (_label, headers) => {
    expect(isCrossSitePost(new Headers(headers))).toBe(false);
  });

  it.each<[string, Record<string, string>]>([
    ['Sec-Fetch-Site cross-site', { ...SAME, 'sec-fetch-site': 'cross-site' }],
    ['Sec-Fetch-Site same-site', { ...SAME, 'sec-fetch-site': 'same-site' }],
    ['Sec-Fetch-Site none', { ...SAME, 'sec-fetch-site': 'none' }],
    ['Origin null', { ...SAME, origin: 'null' }],
    ['another Origin', { ...SAME, origin: 'https://evil.example' }],
    ['another port', { ...SAME, origin: 'https://otakuleague.com:8443' }],
    ['an unparseable Origin', { ...SAME, origin: 'not a url' }],
    ['an Origin and no host', { origin: SAME.origin }],
  ])('refuses %s', (_label, headers) => {
    expect(isCrossSitePost(new Headers(headers))).toBe(true);
  });
});
