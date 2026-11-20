// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next-path';
import { parseWebPublicUrl } from './web-public-url';

const BASES = ['https://beta.otakuleague.com', 'http://localhost:3000'].map(
  (origin) => parseWebPublicUrl(origin),
);

// Each row: [label, next, expected]. Open-redirect payloads first, then paths that are kept.
const ROWS: readonly (readonly [string, unknown, string])[] = [
  ['a protocol-relative URL', '//evil.com', '/'],
  ['a backslash after the slash', '/\\evil.com', '/'],
  ['an encoded tab, kept as a path', '/%09/evil.com', '/%09/evil.com'],
  ['a tab inside the scheme', 'ht\ttps://evil.com', '/'],
  ['a newline inside the scheme', 'java\nscript:alert(1)', '/'],
  ['a scheme without slashes', 'https:evil.com', '/'],
  ['javascript:', 'javascript:alert(1)', '/'],
  ['a dot segment hiding //', '/.//evil.com', '/'],
  ['a dot-dot segment hiding //', '/a/..//evil.com', '/'],
  ['a dot segment hiding /\\', '/./\\evil.com', '/'],
  ['a raw tab the parser strips', '/\t/evil.com', '/'],
  ['a leading backslash', '\\/evil.com', '/'],
  ['credentials before another host', 'http://localhost:3000@evil.com/', '/'],
  ['a File', new File(['/my-list'], 'next'), '/'],
  ['null', null, '/'],
  ['an empty string', '', '/'],
  ['a value over 2048 characters', `/${'a'.repeat(2048)}`, '/'],
  ['a path, query kept and hash dropped', '/my-list?tab=1#x', '/my-list?tab=1'],
  ['a backslash inside the path', '/x\\y', '/x/y'],
  ['a 2048 character path', `/${'a'.repeat(2047)}`, `/${'a'.repeat(2047)}`],
];

describe.each(BASES)('safeNextPath on $origin', (webPublicUrl) => {
  it.each(ROWS)('%s', (_label, next, expected) => {
    const path = safeNextPath(next, webPublicUrl);

    expect(path).toBe(expected);
    expect(new URL(path, webPublicUrl.origin).origin).toBe(webPublicUrl.origin);
    expect(path.startsWith('//')).toBe(false);
  });

  it('refuses a protocol-relative URL even to our own host', () => {
    const { host } = new URL(webPublicUrl.origin);

    expect(safeNextPath(`//${host}/my-list`, webPublicUrl)).toBe('/');
    expect(safeNextPath(`/\\${host}/my-list`, webPublicUrl)).toBe('/');
  });
});
