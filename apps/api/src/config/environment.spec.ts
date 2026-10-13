import { describe, expect, it } from 'vitest';
import { isInsideRepo, validateEnvironment } from './environment';

const VALID_ENVIRONMENT = {
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:s3cret-password@127.0.0.1:5432/otakuleague',
};

function validationMessage(config: Record<string, unknown>): string {
  try {
    validateEnvironment(config);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected validateEnvironment to throw');
}

describe('validateEnvironment', () => {
  it('accepts a complete environment and converts PORT to a number', () => {
    const environment = validateEnvironment(VALID_ENVIRONMENT);

    expect(environment.NODE_ENV).toBe('development');
    expect(environment.PORT).toBe(3001);
    expect(environment.DATABASE_URL).toBe(VALID_ENVIRONMENT.DATABASE_URL);
  });

  it('defaults PORT to 3001 when it is not set', () => {
    const { NODE_ENV, DATABASE_URL } = VALID_ENVIRONMENT;

    expect(validateEnvironment({ NODE_ENV, DATABASE_URL }).PORT).toBe(3001);
  });

  it.each([
    'postgresql://user:pw@otaku_db:5432/otakuleague',
    'postgresql:///otakuleague?host=/var/run/postgresql',
    'postgresql://localhost/otakuleague',
  ])('accepts the valid connection string %s', (databaseUrl) => {
    expect(
      validateEnvironment({ ...VALID_ENVIRONMENT, DATABASE_URL: databaseUrl })
        .DATABASE_URL,
    ).toBe(databaseUrl);
  });

  it('defaults PORT to 3001 when it is empty (PORT= in .env)', () => {
    expect(validateEnvironment({ ...VALID_ENVIRONMENT, PORT: '' }).PORT).toBe(
      3001,
    );
  });

  it('accepts the postgres:// scheme and a host without a TLD', () => {
    const environment = validateEnvironment({
      ...VALID_ENVIRONMENT,
      DATABASE_URL: 'postgres://user:pw@db:5432/otakuleague',
    });

    expect(environment.DATABASE_URL).toBe(
      'postgres://user:pw@db:5432/otakuleague',
    );
  });

  it('accepts every allowed NODE_ENV', () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      expect(
        validateEnvironment({ ...VALID_ENVIRONMENT, NODE_ENV: nodeEnv })
          .NODE_ENV,
      ).toBe(nodeEnv);
    }
  });

  it('lists every problem in one message when everything is missing', () => {
    expect(validationMessage({})).toBe(
      [
        'Invalid environment configuration:',
        '  - NODE_ENV is missing',
        '  - DATABASE_URL is missing',
      ].join('\n'),
    );
  });

  it('treats an empty variable (KEY= in .env) as missing', () => {
    expect(
      validationMessage({ ...VALID_ENVIRONMENT, DATABASE_URL: '' }),
    ).toContain('DATABASE_URL is missing');
  });

  it.each([
    ['abc', 'PORT must be an integer'],
    ['30.5', 'PORT must be an integer'],
    ['0', 'PORT must be at least 1'],
    ['65536', 'PORT must be at most 65535'],
  ])('rejects PORT=%s with "%s"', (port, expected) => {
    const message = validationMessage({ ...VALID_ENVIRONMENT, PORT: port });

    expect(message).toContain(expected);
    expect(message.match(/PORT/g)).toHaveLength(1);
  });

  it.each(['1', '65535'])('accepts the PORT boundary %s', (port) => {
    expect(validateEnvironment({ ...VALID_ENVIRONMENT, PORT: port }).PORT).toBe(
      Number(port),
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(
      validationMessage({ ...VALID_ENVIRONMENT, NODE_ENV: 'staging' }),
    ).toContain('NODE_ENV must be one of: development, test, production');
  });

  it.each([
    'mysql://user:pw@127.0.0.1:3306/otakuleague',
    'not a url',
    '127.0.0.1:5432/otakuleague',
  ])('rejects DATABASE_URL=%s without echoing it', (databaseUrl) => {
    const message = validationMessage({
      ...VALID_ENVIRONMENT,
      DATABASE_URL: databaseUrl,
    });

    expect(message).toContain(
      'DATABASE_URL must be a postgres:// or postgresql:// URL',
    );
    expect(message).not.toContain(databaseUrl);
  });

  it('never puts the password in the message or the stack', () => {
    const secret = 's3cret-password';
    let caught: unknown;
    try {
      validateEnvironment({
        NODE_ENV: 'staging',
        PORT: 'x',
        DATABASE_URL: `ftp://user:${secret}@host/db`,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const error = caught as Error;
    expect(error.message).not.toContain(secret);
    expect(error.stack).not.toContain(secret);
    expect(error.stack).not.toContain('    at ');
  });
});

describe('isInsideRepo', () => {
  it('finds the monorepo root from the config module', () => {
    expect(isInsideRepo()).toBe(true);
  });
});
