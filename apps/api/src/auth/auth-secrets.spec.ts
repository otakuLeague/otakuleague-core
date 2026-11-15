import { createHmac } from 'node:crypto';
import { inspect } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { CryptoRandom } from '../common/clock-and-random.module';
import type { EnvironmentVariables } from '../config/environment';
import { SequentialRandom } from '../testing/test-app';
import { EnvironmentAuthSecrets } from './auth-secrets';

const FAKE_HMAC_KEY = 'fake-auth-hmac-key-'.padEnd(64, '0');

function secretsFrom(
  variables: Partial<Record<keyof EnvironmentVariables, string>>,
  random = new CryptoRandom(),
): EnvironmentAuthSecrets {
  return new EnvironmentAuthSecrets(
    new ConfigService<EnvironmentVariables, true>(variables),
    random,
  );
}

function digestWith(secrets: EnvironmentAuthSecrets): string {
  return createHmac('sha256', secrets.hmacKey()).update('x').digest('hex');
}

describe('EnvironmentAuthSecrets', () => {
  it('uses the configured key as its UTF-8 bytes', () => {
    const secrets = secretsFrom({
      NODE_ENV: 'production',
      AUTH_HMAC_KEY: FAKE_HMAC_KEY,
    });

    expect(secrets.hmacKey().export().toString('utf8')).toBe(FAKE_HMAC_KEY);
  });

  it.each([
    ['missing', {}],
    ['empty', { AUTH_HMAC_KEY: '' }],
  ])(
    'refuses to start in production when the key is %s, naming only the variable',
    (_, variables) => {
      expect(() =>
        secretsFrom({ NODE_ENV: 'production', ...variables }),
      ).toThrow('AUTH_HMAC_KEY is missing; it is required in production');
    },
  );

  it.each(['development', 'test'])(
    'draws 32 random bytes per process in %s when unset',
    (nodeEnvironment) => {
      const random = new SequentialRandom();
      const secrets = secretsFrom(
        { NODE_ENV: nodeEnvironment, AUTH_HMAC_KEY: '' },
        random,
      );

      expect(secrets.hmacKey().export().toString('hex')).toBe(
        `${'00'.repeat(31)}01`,
      );
    },
  );

  it('gives two processes without a key two different keys', () => {
    const first = secretsFrom({ NODE_ENV: 'development' });
    const second = secretsFrom({ NODE_ENV: 'development' });

    expect(digestWith(first)).not.toBe(digestWith(second));
  });

  it('never prints the key when the key object is logged', () => {
    const secrets = secretsFrom({
      NODE_ENV: 'production',
      AUTH_HMAC_KEY: FAKE_HMAC_KEY,
    });

    expect(inspect(secrets)).not.toContain('fake-auth-hmac-key');
    expect(JSON.stringify(secrets)).not.toContain('fake-auth-hmac-key');
  });
});
