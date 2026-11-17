import { timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ApiErrorCode } from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import { Clock, Random } from '../common/clock-and-random.module';
import { Argon2id, type Argon2idInput } from './argon2id';
import { normalisePassword } from './credential-rules';
import { HashSlots, type HashTry } from './hash-slots';
import {
  ARGON2_PARAMS,
  type Argon2Cost,
  DUMMY_PHC,
  formatPhc,
  needsRehash,
  parsePhc,
} from './password-phc';

export type PasswordCheck = 'match' | 'mismatch';

/** Longest password after NFC, in UTF-8 bytes; a backstop under the boundary's 128 characters (ADR 0015). */
export const MAX_PASSWORD_BYTES = 1024;

/** Refusals at the cap are logged at most this often. */
const BUSY_WARN_INTERVAL_MS = 60_000;

/** UTF-16 units refused before NFC runs (slow on long runs of combining marks): never over the cap after NFC in practice. */
const MAX_PASSWORD_UNITS = 4 * MAX_PASSWORD_BYTES;

/** NFC UTF-8 bytes, or null when over MAX_PASSWORD_BYTES (or over MAX_PASSWORD_UNITS before NFC). */
function passwordBytes(password: string): Buffer | null {
  if (password.length > MAX_PASSWORD_UNITS) return null;
  const bytes = Buffer.from(normalisePassword(password), 'utf8');
  return bytes.length > MAX_PASSWORD_BYTES ? null : bytes;
}

export const AUTH_BUSY = 'AUTH_BUSY' satisfies ApiErrorCode;

/** 429, not 503: the filter logs every 5xx with a stack, a flood would be one line each (ADR 0019). */
function authBusy(): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    {
      code: AUTH_BUSY,
      message:
        'Too many passwords are being checked right now. Try again in a moment.',
    },
    { retryAfterSeconds: 1 },
  );
}

function argon2Input(
  password: Buffer,
  salt: Buffer,
  cost: Argon2Cost & { readonly tagLength: number },
): Argon2idInput {
  const { memoryKiB, passes, parallelism, tagLength } = cost;
  return { password, salt, memoryKiB, passes, parallelism, tagLength };
}

function passwordTooLong(): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, {
    code: 'BAD_REQUEST',
    message: 'The password is too long.',
  });
}

/** argon2id password hashes as PHC strings (ADR 0015). Never logs a password, hash or salt. */
@Injectable()
export class PasswordHasher {
  private readonly logger = new Logger(PasswordHasher.name);
  private busyWarnedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly argon2id: Argon2id,
    private readonly slots: HashSlots,
    private readonly random: Random,
    private readonly clock: Clock,
  ) {}

  async hash(password: string): Promise<string> {
    const bytes = passwordBytes(password);
    if (bytes === null) throw passwordTooLong();
    const salt = this.random.bytes(ARGON2_PARAMS.saltLength);
    const tag = await this.derive(bytes, salt, ARGON2_PARAMS);
    return formatPhc(ARGON2_PARAMS, salt, tag);
  }

  /** Like `hash`, for optional work: never queued and never AUTH_BUSY, `skipped` when no slot is free. */
  async tryHash(password: string): Promise<HashTry<string>> {
    const bytes = passwordBytes(password);
    if (bytes === null) throw passwordTooLong();
    const salt = this.random.bytes(ARGON2_PARAMS.saltLength);
    const run = await this.slots.tryRun(() =>
      this.argon2id.derive(argon2Input(bytes, salt, ARGON2_PARAMS)),
    );
    if (run.kind === 'skipped') return run;
    return { kind: 'done', value: formatPhc(ARGON2_PARAMS, salt, run.value) };
  }

  /** No hash, an unreadable one or an over-long password: one dummy verification, then a mismatch. */
  async verify(password: string, phc: string | null): Promise<PasswordCheck> {
    const bytes = passwordBytes(password);
    const stored = bytes === null || phc === null ? null : parsePhc(phc);
    const target = stored ?? DUMMY_PHC;
    const tag = await this.derive(bytes ?? Buffer.alloc(0), target.salt, {
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
    password: Buffer,
    salt: Buffer,
    cost: Argon2Cost & { readonly tagLength: number },
  ): Promise<Buffer> {
    const run = await this.slots.run(() =>
      this.argon2id.derive(argon2Input(password, salt, cost)),
    );
    if (run.kind === 'busy') {
      this.warnBusy();
      throw authBusy();
    }
    return run.value;
  }

  private warnBusy(): void {
    const now = this.clock.now().getTime();
    if (now - this.busyWarnedAt < BUSY_WARN_INTERVAL_MS) return;
    this.busyWarnedAt = now;
    this.logger.warn('Password hash cap reached: sign-ins are refused.');
  }
}
