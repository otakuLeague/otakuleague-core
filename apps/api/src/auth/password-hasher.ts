import { timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { Random } from '../common/clock-and-random.module';
import { Argon2id } from './argon2id';
import { HashSlots } from './hash-slots';
import {
  ARGON2_PARAMS,
  type Argon2Cost,
  DUMMY_PHC,
  formatPhc,
  needsRehash,
  parsePhc,
} from './password-phc';

export type PasswordCheck = 'match' | 'mismatch';

/** Every slot and queue place taken: Retry-After 1 (one hash takes well under a second). */
function authBusy(): ApiException {
  return new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    {
      code: 'AUTH_BUSY',
      message:
        'Too many passwords are being checked right now. Try again in a moment.',
    },
    { retryAfterSeconds: 1 },
  );
}

/** argon2id password hashes as PHC strings (ADR 0015). Logs nothing. */
@Injectable()
export class PasswordHasher {
  constructor(
    private readonly argon2id: Argon2id,
    private readonly slots: HashSlots,
    private readonly random: Random,
  ) {}

  async hash(password: string): Promise<string> {
    const salt = this.random.bytes(ARGON2_PARAMS.saltLength);
    const tag = await this.derive(password, salt, ARGON2_PARAMS);
    return formatPhc(ARGON2_PARAMS, salt, tag);
  }

  /** No hash or an unreadable one costs one dummy verification and is a mismatch. */
  async verify(password: string, phc: string | null): Promise<PasswordCheck> {
    const stored = phc === null ? null : parsePhc(phc);
    const target = stored ?? DUMMY_PHC;
    const tag = await this.derive(password, target.salt, {
      ...target,
      tagLength: target.tag.length,
    });
    const same =
      tag.length === target.tag.length && timingSafeEqual(tag, target.tag);
    return stored !== null && same ? 'match' : 'mismatch';
  }

  needsRehash(phc: string): boolean {
    return needsRehash(phc);
  }

  private async derive(
    password: string,
    salt: Buffer,
    cost: Argon2Cost & { readonly tagLength: number },
  ): Promise<Buffer> {
    const run = await this.slots.run(() =>
      this.argon2id.derive({
        password: Buffer.from(password.normalize('NFC'), 'utf8'),
        salt,
        memoryKiB: cost.memoryKiB,
        passes: cost.passes,
        parallelism: cost.parallelism,
        tagLength: cost.tagLength,
      }),
    );
    if (run.kind === 'busy') throw authBusy();
    return run.value;
  }
}
