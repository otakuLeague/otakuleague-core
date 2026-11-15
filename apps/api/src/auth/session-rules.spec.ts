import { describe, expect, it } from 'vitest';
import {
  hashSessionToken,
  SESSION_IDLE_MS,
  SESSION_MAX_AGE_MS,
  SESSION_RENEW_BELOW_MS,
  sessionTokenFromHeader,
  sessionValidity,
} from './session-rules';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// An obvious fake of the real shape (43 base64url characters).
const TOKEN = 'fake-session-token-'.padEnd(43, 'A');

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

function check(expiresIn: number, createdAgo = DAY, userEpoch = 0) {
  return sessionValidity(
    { sessionEpoch: 0, createdAt: at(-createdAgo), expiresAt: at(expiresIn) },
    { sessionEpoch: userEpoch },
    NOW,
  );
}

describe('sessionTokenFromHeader', () => {
  it('reads the token of a well-formed Bearer header', () => {
    expect(sessionTokenFromHeader(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it.each<[string, unknown]>([
    ['no header', undefined],
    ['a repeated header', [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]],
    ['another scheme', `Basic ${TOKEN}`],
    ['a lower-case scheme', `bearer ${TOKEN}`],
    ['two spaces', `Bearer  ${TOKEN}`],
    ['the bare token', TOKEN],
    ['42 characters', `Bearer ${TOKEN.slice(1)}`],
    ['44 characters', `Bearer ${TOKEN}A`],
    ['padding', `Bearer ${TOKEN.slice(1)}=`],
    ['standard base64', `Bearer ${TOKEN.slice(2)}+/`],
    ['a trailing space', `Bearer ${TOKEN} `],
    ['a trailing newline', `Bearer ${TOKEN}\n`],
  ])('refuses %s', (_, header) => {
    expect(sessionTokenFromHeader(header)).toBeNull();
  });
});

describe('hashSessionToken', () => {
  it('is the SHA-256 of the token text (FIPS 180-2 vector for "abc")', () => {
    expect(Buffer.from(hashSessionToken('abc')).toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashSessionToken(TOKEN)).toHaveLength(32);
  });
});

describe('sessionValidity', () => {
  it('is valid without a write while 20 days remain', () => {
    expect(check(20 * DAY)).toEqual({ kind: 'valid', renewTo: null });
  });

  it.each([
    ['exactly 15 days', SESSION_RENEW_BELOW_MS],
    ['15 days and 1 ms', SESSION_RENEW_BELOW_MS + 1],
  ])('does not renew with %s left', (_, left) => {
    expect(check(left)).toEqual({ kind: 'valid', renewTo: null });
  });

  it.each([
    ['15 days minus 1 ms', SESSION_RENEW_BELOW_MS - 1],
    ['1 ms', 1],
  ])('renews to now + 30 days with %s left', (_, left) => {
    expect(check(left)).toEqual({
      kind: 'valid',
      renewTo: at(SESSION_IDLE_MS),
    });
  });

  it('is expired when expiresAt equals now, and after it', () => {
    expect(check(0)).toEqual({ kind: 'expired' });
    expect(check(-1)).toEqual({ kind: 'expired' });
  });

  it('is expired at the hard stop, even with time left on expiresAt', () => {
    expect(check(10 * DAY, SESSION_MAX_AGE_MS)).toEqual({ kind: 'expired' });
    expect(check(10 * DAY, SESSION_MAX_AGE_MS - 1)).toEqual({
      kind: 'valid',
      renewTo: null,
    });
  });

  it('caps the renewal at the hard stop', () => {
    expect(check(5 * DAY, 170 * DAY)).toEqual({
      kind: 'valid',
      renewTo: at(10 * DAY),
    });
  });

  it('writes nothing when the hard stop leaves nothing to extend', () => {
    expect(check(DAY, SESSION_MAX_AGE_MS - DAY)).toEqual({
      kind: 'valid',
      renewTo: null,
    });
  });

  it.each([1, -1])(
    'is revoked when the user epoch differs by %i, however fresh the session',
    (delta) => {
      expect(check(20 * DAY, DAY, delta)).toEqual({ kind: 'revoked' });
    },
  );

  it('is expired, never valid, for an invalid date', () => {
    expect(check(Number.NaN)).toEqual({ kind: 'expired' });
    expect(check(20 * DAY, Number.NaN)).toEqual({ kind: 'expired' });
  });
});
