import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_MAX } from './credential-rules';
import { PASSWORD_RAW_MAX } from './sign-in.dto';
import { SignUpDto } from './sign-up.dto';

const VALID = {
  username: 'Frieren',
  email: 'frieren@example.test',
  password: 'fake password for tests 1',
} as const;

/** 64 + 1 + 63 + 1 + 63 + 1 + `last` + 5 characters: labels at their 63 maximum. */
const emailOf = (last: number): string =>
  `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(last)}.test`;

/** The fields refused, as the validation pipe sees them (whitelist rules aside). */
async function refusedFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(SignUpDto, body));
  return errors.map((error) => error.property);
}

async function messages(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(SignUpDto, body));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('SignUpDto', () => {
  it('accepts a valid sign-up', async () => {
    expect(await refusedFields(VALID)).toEqual([]);
  });

  it.each([
    ['254 characters', emailOf(56)],
    ['any case and padding', '  FRIEREN@Example.TEST '],
  ])('accepts an email of %s', async (_, email) => {
    expect(email.length).toBeLessThanOrEqual(254);
    expect(await refusedFields({ ...VALID, email })).toEqual([]);
  });

  it.each([
    ['255 characters', emailOf(57)],
    ['no "@"', 'frieren.example.test'],
    ['a NUL', 'frieren\u0000@example.test'],
    ['a non-ASCII letter', 'frierén@example.test'],
    ['whitespace only', '   '],
    ['a number', 42],
    ['nothing', undefined],
  ])('refuses an email of %s', async (_, email) => {
    expect(await refusedFields({ ...VALID, email })).toEqual(['email']);
  });

  it('refuses an over-long raw email without normalising it', async () => {
    const email = `${'A'.repeat(100_000)}@example.test`;
    const normalize = vi.spyOn(String.prototype, 'normalize');

    // No password either: its own rules normalise it.
    const refused = await refusedFields({ username: VALID.username, email });

    expect(normalize).not.toHaveBeenCalled();
    normalize.mockRestore();
    expect(refused).toEqual(['email', 'password']);
  });

  it.each([
    ['an "@"', 'frieren@x'],
    ['2 characters', 'ab'],
    ['21 characters', 'x'.repeat(21)],
    ['padding', ' Frieren '],
    ['a number', 1234],
  ])('refuses a username with %s', async (_, username) => {
    expect(await refusedFields({ ...VALID, username })).toEqual(['username']);
  });

  it.each([
    ['7 characters', 'abcdef1'],
    ['no digit or symbol', 'abcdefghij'],
    ['one code point over the maximum', `1${'a'.repeat(PASSWORD_MAX)}`],
    ['an empty string', ''],
    ['a number', 12345678],
  ])('refuses a password of %s', async (_, password) => {
    expect(await refusedFields({ ...VALID, password })).toEqual(['password']);
  });

  it(`accepts ${PASSWORD_MAX} code points after NFC, from ${2 * PASSWORD_MAX - 1} before`, async () => {
    const password = `1${'é'.repeat(PASSWORD_MAX - 1)}`;

    expect(await refusedFields({ ...VALID, password })).toEqual([]);
  });

  it('refuses an over-long raw password without normalising it', async () => {
    const password = `1${'́'.repeat(PASSWORD_RAW_MAX)}`;
    const normalize = vi.spyOn(String.prototype, 'normalize');

    // No email either: its shape is checked on the normalised address.
    const refused = await refusedFields({ username: VALID.username, password });

    expect(normalize).not.toHaveBeenCalled();
    normalize.mockRestore();
    expect(refused).toEqual(['email', 'password']);
  });

  it('never echoes a refused value in a message', async () => {
    const body = {
      username: 'secret@name',
      email: 'secret-address',
      password: 'secretpw',
    };

    const texts = await messages(body);

    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text).not.toContain('secret');
  });
});
