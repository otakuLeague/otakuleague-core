import { createSecretKey, type KeyObject } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Random } from '../common/clock-and-random.module';
import type { EnvironmentVariables } from '../config/environment';

/** Bytes drawn for a key when AUTH_HMAC_KEY is unset outside production. */
const GENERATED_KEY_BYTES = 32;

/** Logged once at start when the key is drawn; no ":" or "=" right after a name (log redaction). */
export const GENERATED_KEY_WARNING =
  'AUTH_HMAC_KEY is not set, so auth rate-limit counters use a random key for this process and start afresh at each restart';

/**
 * The key behind every auth rate-limit key (ADR 0015); tests replace this provider. A KeyObject,
 * not a Buffer: it is immutable and prints no key material if it ever reaches a log.
 */
export abstract class AuthSecrets {
  abstract hmacKey(): KeyObject;
}

@Injectable()
export class EnvironmentAuthSecrets
  extends AuthSecrets
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EnvironmentAuthSecrets.name);
  private readonly key: KeyObject;
  private readonly generated: boolean;

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
    this.generated = !isSet;
    this.key = createSecretKey(
      isSet
        ? Buffer.from(configured, 'utf8')
        : random.bytes(GENERATED_KEY_BYTES),
    );
  }

  hmacKey(): KeyObject {
    return this.key;
  }

  // At bootstrap, not in the constructor, so tests that silence the app logger stay quiet.
  onApplicationBootstrap(): void {
    if (this.generated) this.logger.warn(GENERATED_KEY_WARNING);
  }
}
