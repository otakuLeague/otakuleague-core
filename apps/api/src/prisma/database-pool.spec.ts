import { describe, expect, it } from 'vitest';
import { databasePoolConfig, UTC_SESSION_OPTIONS } from './database-pool';

// An obvious fake password: every refusal must leave it out of the message.
const PASSWORD = 'fake-db-password-0000';
const URL_WITHOUT_OPTIONS = `postgresql://app:${PASSWORD}@127.0.0.1:5432/otakuleague?sslmode=disable`;

function refusalMessage(connectionString: string): string {
  try {
    databasePoolConfig(connectionString);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(
    'expected databasePoolConfig to refuse the connection string',
  );
}

describe('databasePoolConfig', () => {
  it('pins the session time zone to UTC and passes the connection string untouched', () => {
    expect(databasePoolConfig(URL_WITHOUT_OPTIONS)).toEqual({
      connectionString: URL_WITHOUT_OPTIONS,
      options: '-c timezone=UTC',
    });
    expect(UTC_SESSION_OPTIONS).toBe('-c timezone=UTC');
  });

  it.each([
    [
      'a time zone',
      `${URL_WITHOUT_OPTIONS}&options=-c%20timezone%3DAsia%2FTokyo`,
    ],
    ['an empty value', `${URL_WITHOUT_OPTIONS}&options=`],
    [
      'the first parameter',
      `postgresql://app:${PASSWORD}@db/otakuleague?options=x`,
    ],
    ['a percent-encoded name', `${URL_WITHOUT_OPTIONS}&%6Fptions=x`],
  ])(
    'refuses an options parameter (%s), which pg would let win over the pin',
    (_label, connectionString) => {
      const message = refusalMessage(connectionString);

      expect(message).toBe(
        'DATABASE_URL must not set the `options` parameter: every pool pins the session time zone to UTC (OTA-200).',
      );
      expect(message).not.toContain(PASSWORD);
    },
  );

  it('refuses a keyword/value string, which it cannot check, without echoing it', () => {
    const message = refusalMessage(
      `host=127.0.0.1 user=app password=${PASSWORD} options='-c timezone=Asia/Tokyo'`,
    );

    expect(message).toBe('DATABASE_URL must be a URL.');
    expect(message).not.toContain(PASSWORD);
  });
});
