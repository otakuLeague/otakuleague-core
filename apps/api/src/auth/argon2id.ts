import * as nodeCrypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Argon2Cost } from './password-phc';

export interface Argon2idInput extends Argon2Cost {
  readonly password: Buffer;
  readonly salt: Buffer;
  readonly tagLength: number;
}

/** argon2id key derivation; unit tests replace it with a fast fake. */
export abstract class Argon2id {
  abstract derive(input: Argon2idInput): Promise<Buffer>;
}

// Typed by @types/node 24 but missing before Node 24.7: checked on each call, not at import,
// so the app still boots (and unit tests run) on an older Node.
const nodeArgon2: typeof nodeCrypto.argon2 | undefined = nodeCrypto.argon2;

/** The only caller of crypto.argon2; runs on the libuv thread pool. */
@Injectable()
export class NodeArgon2id extends Argon2id {
  derive(input: Argon2idInput): Promise<Buffer> {
    if (nodeArgon2 === undefined) {
      return Promise.reject(new Error('crypto.argon2 needs Node 24.7 or later'));
    }
    return new Promise((resolve, reject) => {
      nodeArgon2(
        'argon2id',
        {
          message: input.password,
          nonce: input.salt,
          memory: input.memoryKiB,
          passes: input.passes,
          parallelism: input.parallelism,
          tagLength: input.tagLength,
        },
        (error, tag) => {
          if (error === null) resolve(tag);
          else reject(error);
        },
      );
    });
  }
}
