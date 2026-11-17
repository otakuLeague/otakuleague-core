/** argon2id cost for new hashes (ADR 0015, OWASP minimum). Raising one makes older hashes `needsRehash`. */
export const ARGON2_PARAMS = {
  memoryKiB: 19_456,
  passes: 2,
  parallelism: 1,
  saltLength: 16,
  tagLength: 32,
} as const;

export interface Argon2Cost {
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
}

export interface ParsedPhc extends Argon2Cost {
  readonly salt: Buffer;
  readonly tag: Buffer;
}

// What a stored hash may ask for: a corrupt or tampered row must not request huge memory or
// time, nor values crypto.argon2 rejects (that would be a 500 instead of a mismatch).
const MAX_MEMORY_KIB = 65_536;
const MAX_PASSES = 10;
// p > 1 makes OpenSSL start its own threads, outside the libuv pool HashSlots protects.
const MAX_PARALLELISM = 1;

// Anchored, digits without leading zeros, standard base64 without padding (PHC string format).
// Salt and tag: 22 to 86 characters, 16 to 64 bytes.
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=([1-9][0-9]{0,5}),t=([1-9][0-9]?),p=([1-9])\$([A-Za-z0-9+/]{22,86})\$([A-Za-z0-9+/]{22,86})$/;

const toBase64 = (bytes: Buffer): string =>
  bytes.toString('base64').replace(/=+$/, '');

/** Strict: null unless the text is the canonical encoding (Buffer.from alone ignores stray bits). */
function fromBase64(text: string): Buffer | null {
  const bytes = Buffer.from(text, 'base64');
  return toBase64(bytes) === text ? bytes : null;
}

export function formatPhc(cost: Argon2Cost, salt: Buffer, tag: Buffer): string {
  const { memoryKiB, passes, parallelism } = cost;
  return `$argon2id$v=19$m=${memoryKiB},t=${passes},p=${parallelism}$${toBase64(salt)}$${toBase64(tag)}`;
}

/** argon2id v19 within the bounds above, or null. */
export function parsePhc(phc: string): ParsedPhc | null {
  const match = PHC_PATTERN.exec(phc);
  if (match === null) return null;
  const [, memory = '', passes = '', parallelism = '', salt = '', tag = ''] =
    match;
  const cost = {
    memoryKiB: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  };
  const saltBytes = fromBase64(salt);
  const tagBytes = fromBase64(tag);
  const inBounds =
    cost.memoryKiB >= 8 * cost.parallelism &&
    cost.memoryKiB <= MAX_MEMORY_KIB &&
    cost.passes <= MAX_PASSES &&
    cost.parallelism <= MAX_PARALLELISM;
  if (!inBounds || saltBytes === null || tagBytes === null) return null;
  return { ...cost, salt: saltBytes, tag: tagBytes };
}

/**
 * True when the stored hash is unreadable or any of its parameters is below ARGON2_PARAMS.
 * Only weaker, never just different: a rollback or an older instance during a deploy must not
 * rewrite a stronger hash with its lower constants.
 */
export function needsRehash(phc: string): boolean {
  const parsed = parsePhc(phc);
  return (
    parsed === null ||
    parsed.memoryKiB < ARGON2_PARAMS.memoryKiB ||
    parsed.passes < ARGON2_PARAMS.passes ||
    parsed.parallelism < ARGON2_PARAMS.parallelism ||
    parsed.salt.length < ARGON2_PARAMS.saltLength ||
    parsed.tag.length < ARGON2_PARAMS.tagLength
  );
}

/** Verified against when there is no usable hash, so a missing account costs the same time. Never a match. */
export const DUMMY_PHC: ParsedPhc = {
  memoryKiB: ARGON2_PARAMS.memoryKiB,
  passes: ARGON2_PARAMS.passes,
  parallelism: ARGON2_PARAMS.parallelism,
  salt: Buffer.alloc(ARGON2_PARAMS.saltLength, 0xa5),
  tag: Buffer.alloc(ARGON2_PARAMS.tagLength, 0x5a),
};
