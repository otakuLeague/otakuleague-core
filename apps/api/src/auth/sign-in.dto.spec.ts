import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_MAX } from './credential-rules';
import { PASSWORD_RAW_MAX, SignInDto } from './sign-in.dto';

const PASSWORD = 'fake password for tests 1';

/** The fields refused, as the validation pipe sees them (whitelist rules aside). */
async function refusedFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(SignInDto, body));
  return errors.map((error) => error.property);
}

describe('SignInDto', () => {
  it.each([
    ['254 characters', `${'a'.repeat(241)}@example.test`],
    ['a padded username', '  Frieren '],
  ])('accepts an identifier of %s', async (_, identifier) => {
    expect(await refusedFields({ identifier, password: PASSWORD })).toEqual([]);
  });

  it.each([
    ['255 characters', `${'a'.repeat(242)}@example.test`],
    ['whitespace only', '   '],
    ['a NUL', 'frieren\u0000'],
    ['an empty string', ''],
  ])('refuses an identifier of %s', async (_, identifier) => {
    expect(await refusedFields({ identifier, password: PASSWORD })).toEqual([
      'identifier',
    ]);
  });

  it('names the field in the NUL message', async () => {
    const [error] = await validate(
      plainToInstance(SignInDto, { identifier: 'a\u0000', password: PASSWORD }),
    );
    expect(error?.constraints?.withoutNul).toBe(
      'identifier must not contain U+0000',
    );
  });

  it(`accepts ${PASSWORD_MAX} code points after NFC, from ${2 * PASSWORD_MAX} before`, async () => {
    const password = 'é'.repeat(PASSWORD_MAX);

    expect(await refusedFields({ identifier: 'frieren', password })).toEqual(
      [],
    );
  });

  it.each([
    ['one code point over', 'a'.repeat(PASSWORD_MAX + 1)],
    ['a number', 12345678],
    ['empty', ''],
  ])('refuses a password %s', async (_, password) => {
    expect(await refusedFields({ identifier: 'frieren', password })).toEqual([
      'password',
    ]);
  });

  it('refuses an over-long raw password without normalising it', async () => {
    const password = `a${'́'.repeat(PASSWORD_RAW_MAX)}`;
    const normalize = vi.spyOn(String.prototype, 'normalize');

    const refused = await refusedFields({ identifier: 'frieren', password });

    expect(normalize).not.toHaveBeenCalled();
    normalize.mockRestore();
    expect(refused).toEqual(['password']);
  });
});
