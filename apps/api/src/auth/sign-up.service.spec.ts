import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import { isUsernameKeyConflict } from './sign-up.service';

function knownError(
  code: string,
  meta: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('fake database error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

/** A raw-query failure as the pg adapter wraps it. */
const rawError = (cause: Record<string, unknown>) =>
  knownError('P2010', {
    driverAdapterError: { name: 'DriverAdapterError', cause },
  });

describe('isUsernameKeyConflict', () => {
  it.each([
    [
      'a raw unique violation naming the column',
      rawError({
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['username_key'] },
      }),
    ],
    [
      'a raw unique violation naming the index',
      rawError({
        kind: 'UniqueConstraintViolation',
        constraint: { index: 'app_user_username_key_key' },
      }),
    ],
    [
      'a raw 23505 known only by its message',
      rawError({
        kind: 'postgres',
        originalCode: '23505',
        originalMessage:
          'duplicate key value violates unique constraint "app_user_username_key_key"',
      }),
    ],
    [
      'a P2002 with its target',
      knownError('P2002', { target: ['username_key'] }),
    ],
  ])('maps %s to the 409', (_, error) => {
    expect(isUsernameKeyConflict(error)).toBe(true);
  });

  it.each([
    [
      'a unique violation on the email',
      rawError({
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['email'] },
      }),
    ],
    [
      'another raw failure that quotes the column',
      rawError({
        kind: 'postgres',
        originalCode: '57014',
        originalMessage: 'canceling statement: username_key',
      }),
    ],
    [
      'another known error naming the column',
      knownError('P2025', { target: ['username_key'] }),
    ],
    ['a plain error', new Error('username_key')],
    ['a non-error', 'username_key'],
  ])('leaves %s alone (it propagates)', (_, error) => {
    expect(isUsernameKeyConflict(error)).toBe(false);
  });
});
