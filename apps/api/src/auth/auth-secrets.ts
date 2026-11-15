import { createSecretKey, type KeyObject } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Random } from '../common/clock-and-random.module';
import type { EnvironmentVariables } from '../config/environment';

/** Bytes drawn for a key when AUTH_HMAC_KEY is unset outside production. */
const GENERATED_KEY_BYTES = 32;

/**
 * The key behind every auth rate-limit key (ADR 0015); tests replace this provider. A KeyObject,
 * not a Buffer: it is immutable and prints no key material if it ever reaches a log.
 */
export abstract class AuthSecrets {
  abstract hmacKey(): KeyObject;
}

@Injectable()
export class EnvironmentAuthSecrets extends AuthSecrets {
  private readonly key: KeyObject;

  /**
   * Validated at boot (`environment.ts`): required in production. Checked again here so a
   * production API never falls back to a per-process key, which would reset every counter at
   * each deploy. The message names the variable, never a value.
   */
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    random: Random,
  ) {
    super();
    const configured = config.get('AUTH_HMAC_KEY', { infer: true });
    const isSet = configured !== undefined && configured !== '';
    if (!isSet && config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error('AUTH_HMAC_KEY is missing; it is required in production');
    }
    this.key = createSecretKey(
      isSet
        ? Buffer.from(configured, 'utf8')
        : random.bytes(GENERATED_KEY_BYTES),
    );
  }

  hmacKey(): KeyObject {
    return this.key;
  }
}
