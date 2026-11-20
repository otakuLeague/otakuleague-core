import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { USERNAME_RULE_MESSAGE } from './sign-up-rules';
import { UsernameAvailabilityQueryDto } from './username-availability.dto';

async function messages(query: object): Promise<string[]> {
  const errors = await validate(
    plainToInstance(UsernameAvailabilityQueryDto, query),
  );
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UsernameAvailabilityQueryDto', () => {
  it.each(['Frieren', 'abc', 'x'.repeat(20), 'admin', 'a_1'])(
    'accepts %j, a name sign-up accepts',
    async (username) => {
      expect(await messages({ username })).toEqual([]);
    },
  );

  it.each([
    ['2 characters', 'ab'],
    ['21 characters', 'x'.repeat(21)],
    ['an "@"', 'frieren@x'],
    ['padding', ' Frieren '],
    ['a non-ASCII letter', 'Frierén'],
    ['an empty string', ''],
  ])("refuses a username of %s with sign-up's message", async (_, username) => {
    expect(await messages({ username })).toEqual([USERNAME_RULE_MESSAGE]);
  });

  it.each([
    ['missing', {}],
    ['repeated (an array)', { username: ['Frieren', 'Himmel'] }],
  ])('refuses a username %s', async (_, query) => {
    expect(await messages(query)).toContain('username must be a string');
  });
});
