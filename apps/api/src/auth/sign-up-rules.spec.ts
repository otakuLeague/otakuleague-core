import { createHash, timingSafeEqual } from 'node:crypto';
import { USERNAME_PATTERN } from '@otakuleague/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { identifierKind, normaliseIdentifier } from './credential-rules';
import {
  AUTH_TOKEN_BYTES,
  bindingMatches,
  hashAuthToken,
  isEmailAddress,
  PENDING_SIGN_UP_TTL_MS,
} from './sign-up-rules';

// The real function, recorded: bindingMatches must compare through it, never with ===.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const email = (typed: string): boolean =>
  isEmailAddress(normaliseIdentifier(typed));

describe('PENDING_SIGN_UP_TTL_MS', () => {
  it('pins the ADR 0015 PENDING_SIGN_UP_TTL: 24 hours', () => {
    expect(PENDING_SIGN_UP_TTL_MS).toBe(24 * 60 * 60_000);
  });
});

describe('USERNAME_PATTERN', () => {
  it.each(['abc', 'Frieren', 'a_1', 'x'.repeat(20), '___'])(
    'accepts %s',
    (username) => {
      expect(USERNAME_PATTERN.test(username)).toBe(true);
    },
  );

  it.each([
    ['2 characters', 'ab'],
    ['21 characters', 'x'.repeat(21)],
    ['an "@" (sign-in would read it as an email)', 'frieren@x'],
    ['a space', 'fri eren'],
    ['padding', ' frieren '],
    ['a non-ASCII letter', 'frierén'],
    ['a dot or a hyphen', 'fri.er-en'],
    ['a NUL', 'frieren\u0000'],
    ['a trailing newline', 'frieren\n'],
    ['nothing', ''],
  ])('refuses %s', (_, username) => {
    expect(USERNAME_PATTERN.test(username)).toBe(false);
  });

  it('only ever names a username at sign-in, and normalises to its lower case', () => {
    const key = normaliseIdentifier('Frieren_99');

    expect(identifierKind(key)).toBe('username');
    expect(key).toBe('frieren_99');
  });
});

describe('isEmailAddress', () => {
  it.each([
    'frieren@example.test',
    '  Frieren@Example.TEST ',
    'a.b+tag@mail.example.co',
    "o'neil@example-mail.test",
    `${'a'.repeat(64)}@example.test`,
  ])('accepts %s once normalised', (typed) => {
    expect(email(typed)).toBe(true);
  });

  it.each([
    ['no "@"', 'frieren.example.test'],
    ['two "@"', 'fri@eren@example.test'],
    ['no domain dot', 'frieren@localhost'],
    ['an empty local part', '@example.test'],
    ['a local part over 64', `${'a'.repeat(65)}@example.test`],
    ['a numeric last label', 'frieren@203.0.113.7'],
    ['a one-letter last label', 'frieren@example.t'],
    ['an empty label', 'frieren@example..test'],
    ['a space inside', 'fri eren@example.test'],
    [
      'a CR LF (a mail header injection)',
      'frieren@example.test\r\nBcc: x@y.test',
    ],
    ['a NUL', 'frieren\u0000@example.test'],
    ['a non-ASCII letter', 'frierén@example.test'],
    ['U+0130, which lower-cases to two code points', 'İ@example.test'],
    ['nothing', ''],
  ])('refuses %s', (_, typed) => {
    expect(email(typed)).toBe(false);
  });
});

describe('auth tokens', () => {
  it('draws 32 bytes (ADR 0015)', () => {
    expect(AUTH_TOKEN_BYTES).toBe(32);
  });

  it('stores the 32-byte SHA-256 of the token text, never the token', () => {
    const token = 'fake-auth-token-'.padEnd(43, 'A');
    const digest = hashAuthToken(token);

    expect(Buffer.from(digest)).toEqual(
      createHash('sha256').update(token, 'utf8').digest(),
    );
    expect(digest).toHaveLength(32);
    expect(Buffer.from(digest).toString('latin1')).not.toContain(token);
  });
});

describe('bindingMatches', () => {
  const BINDING = 'fake-binding-token-'.padEnd(43, 'B');
  const stored = hashAuthToken(BINDING);

  it('matches the bindingToken whose SHA-256 the token row stores', () => {
    expect(bindingMatches(BINDING, stored)).toBe(true);
    expect(bindingMatches(BINDING, new Uint8Array(stored))).toBe(true);
  });

  it.each<[string, string | undefined, Uint8Array | null]>([
    ['no bindingToken sent', undefined, stored],
    [
      'a token row without a binding (resend on the password path)',
      BINDING,
      null,
    ],
    ['neither side', undefined, null],
    ['another bindingToken', 'fake-binding-token-'.padEnd(43, 'C'), stored],
    [
      'the stored digest sent as the token',
      Buffer.from(stored).toString('hex'),
      stored,
    ],
    ['an empty bindingToken', '', stored],
    ['a stored value of another length', BINDING, stored.subarray(0, 31)],
    ['an empty stored value', BINDING, new Uint8Array()],
  ])('refuses %s, without throwing', (_, bindingToken, bindingHash) => {
    expect(bindingMatches(bindingToken, bindingHash)).toBe(false);
  });

  it('compares the digests in constant time', () => {
    vi.mocked(timingSafeEqual).mockClear();

    expect(bindingMatches('fake-binding-token-'.padEnd(43, 'C'), stored)).toBe(
      false,
    );

    expect(timingSafeEqual).toHaveBeenCalledOnce();
  });
});
