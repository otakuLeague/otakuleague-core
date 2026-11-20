// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sessionTokenFrom } from './session-token';

const VALID = 'aZ09_-'.repeat(7) + 'x';

describe('sessionTokenFrom', () => {
  it('accepts 43 base64url characters as they are', () => {
    expect(sessionTokenFrom(VALID)).toBe(VALID);
  });

  it.each([
    ['no cookie', undefined],
    ['an empty value', ''],
    ['42 characters', VALID.slice(1)],
    ['44 characters', `${VALID}A`],
    ['a Bearer prefix', `Bearer ${VALID}`],
    ['a short Bearer value', 'Bearer x'],
    ['surrounding spaces', ` ${VALID} `],
    ['CR/LF', `${VALID.slice(2)}\r\n`],
    ['a semicolon', `${VALID.slice(1)};`],
    ['base64 padding', `${VALID.slice(1)}=`],
  ])('gives nothing for %s', (_label, value) => {
    expect(sessionTokenFrom(value)).toBeUndefined();
  });
});
