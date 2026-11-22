import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { createValidationPipe } from '../common/validation';
import { PASSWORD_MAX } from './credential-rules';
import {
  AUTH_TOKEN_RAW_MAX,
  EmailVerificationConfirmDto,
  EmailVerificationResendDto,
} from './email-verification.dto';

const TOKEN = 'fake-verification-token-'.padEnd(43, 'A');
const BINDING = 'fake-binding-token-'.padEnd(43, 'B');
const PASSWORD = 'fake password 1 for tests';

/** The fields refused, as the validation pipe sees them (whitelist rules aside). */
async function refusedFields(body: object): Promise<string[]> {
  const errors = await validate(
    plainToInstance(EmailVerificationConfirmDto, body),
  );
  return errors.map((error) => error.property);
}

describe('EmailVerificationConfirmDto', () => {
  it.each([
    ['a token alone', { token: TOKEN }],
    ['a token and its binding', { token: TOKEN, bindingToken: BINDING }],
    ['a token and a password', { token: TOKEN, password: PASSWORD }],
    ['all three', { token: TOKEN, bindingToken: BINDING, password: PASSWORD }],
    ['a short token (the lookup refuses it, not validation)', { token: 'abc' }],
    ['a token of 128 characters', { token: 'A'.repeat(AUTH_TOKEN_RAW_MAX) }],
    [
      'a token with characters outside base64url',
      { token: 'not a token; at all\u0000' },
    ],
    [
      `a password of ${PASSWORD_MAX} characters`,
      { token: TOKEN, password: 'a'.repeat(PASSWORD_MAX) },
    ],
    [
      'a password under the sign-up minimum (checked against the hash, not here)',
      { token: TOKEN, password: 'short' },
    ],
  ])('accepts %s', async (_, body) => {
    expect(await refusedFields(body)).toEqual([]);
  });

  it.each<[string, object, string]>([
    ['a missing token', {}, 'token'],
    ['a null token', { token: null }, 'token'],
    ['an empty token', { token: '' }, 'token'],
    ['a numeric token', { token: 42 }, 'token'],
    ['a token of 129 characters', { token: 'A'.repeat(129) }, 'token'],
    [
      'a null bindingToken (never read as "no binding")',
      { token: TOKEN, bindingToken: null },
      'bindingToken',
    ],
    [
      'an empty bindingToken',
      { token: TOKEN, bindingToken: '' },
      'bindingToken',
    ],
    [
      'a bindingToken of 129 characters',
      { token: TOKEN, bindingToken: 'B'.repeat(129) },
      'bindingToken',
    ],
    ['a null password', { token: TOKEN, password: null }, 'password'],
    ['an empty password', { token: TOKEN, password: '' }, 'password'],
    ['a numeric password', { token: TOKEN, password: 12345678 }, 'password'],
    [
      'a password one code point over the maximum',
      { token: TOKEN, password: 'a'.repeat(PASSWORD_MAX + 1) },
      'password',
    ],
  ])('refuses %s', async (_, body, field) => {
    expect(await refusedFields(body)).toEqual([field]);
  });

  it.each([
    [
      'userId',
      { token: TOKEN, userId: '00000000-0000-4000-a000-000000000001' },
    ],
    ['email', { token: TOKEN, email: 'frieren@example.test' }],
  ])(
    'refuses an unknown %s field through the pipe (the member never comes from the body)',
    async (field, body) => {
      const pipe = createValidationPipe();

      await expect(
        pipe.transform(body, {
          type: 'body',
          metatype: EmailVerificationConfirmDto,
        }),
      ).rejects.toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          details: [expect.objectContaining({ field }) as unknown],
        },
      });
    },
  );

  it('never echoes a refused value in a message', async () => {
    const errors = await validate(
      plainToInstance(EmailVerificationConfirmDto, {
        token: `secret${'A'.repeat(200)}`,
        bindingToken: `secret${'B'.repeat(200)}`,
        password: `secret${'C'.repeat(PASSWORD_MAX)}`,
      }),
    );
    const texts = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text).not.toContain('secret');
  });
});

describe('EmailVerificationResendDto', () => {
  /** 64 + 1 + 63 + 1 + 63 + 1 + `last` + 5 characters: labels at their 63 maximum. */
  const emailOf = (last: number): string =>
    `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(last)}.test`;

  const refused = async (body: object): Promise<string[]> =>
    (await validate(plainToInstance(EmailVerificationResendDto, body))).map(
      (error) => error.property,
    );

  it.each([
    ['a plain address', 'frieren@example.test'],
    [
      'any case and padding (normalised by the service)',
      '  FRIEREN@Example.TEST ',
    ],
    ['254 characters', emailOf(56)],
  ])('accepts %s', async (_, email) => {
    expect(await refused({ email })).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['255 characters', emailOf(57)],
    ['no "@"', 'frieren.example.test'],
    ['a NUL', 'frieren\u0000@example.test'],
    ['a non-ASCII letter', 'frierén@example.test'],
    ['a number', 42],
  ])('refuses an email of %s', async (_, email) => {
    expect(await refused({ email })).toEqual(['email']);
  });

  it('refuses an over-long raw email without normalising it', async () => {
    const normalize = vi.spyOn(String.prototype, 'normalize');

    expect(
      await refused({ email: `${'A'.repeat(100_000)}@example.test` }),
    ).toEqual(['email']);
    expect(normalize).not.toHaveBeenCalled();
    normalize.mockRestore();
  });

  it.each([
    [
      'userId',
      {
        email: 'frieren@example.test',
        userId: '00000000-0000-4000-a000-000000000001',
      },
    ],
    ['token', { email: 'frieren@example.test', token: 'fake-token' }],
  ])('refuses an unknown %s field through the pipe', async (field, body) => {
    await expect(
      createValidationPipe().transform(body, {
        type: 'body',
        metatype: EmailVerificationResendDto,
      }),
    ).rejects.toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ field }) as unknown],
      },
    });
  });

  it('never echoes a refused address in a message', async () => {
    const errors = await validate(
      plainToInstance(EmailVerificationResendDto, { email: 'secret-address' }),
    );
    const texts = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toContain('secret');
  });
});
