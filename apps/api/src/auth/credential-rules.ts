/** Password length bounds, in Unicode code points after NFC (passwordLength; ADR 0015, parity). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * Longest identifier as typed, in UTF-16 code units (what `@MaxLength` counts), checked on the
 * raw input before normaliseIdentifier. 254 is the longest email address (RFC 5321 path limit).
 */
export const IDENTIFIER_MAX = 254;

declare const identifierBrand: unique symbol;

/** An identifier after normaliseIdentifier: the only form a lookup or a rate-limit key sees. */
export type NormalisedIdentifier = string & {
  readonly [identifierBrand]: true;
};

export type IdentifierKind = 'email' | 'username';

/** NFC, so "é" typed as one or two code points is the same password. Nothing else is changed. */
export function normalisePassword(password: string): string {
  return password.normalize('NFC');
}

/**
 * Unicode code points after NFC. An accent that NFC composes and an emoji outside the BMP count
 * once; a sequence (a ZWJ emoji, an accent with no composed form) counts each code point.
 */
export function passwordLength(password: string): number {
  return [...normalisePassword(password)].length;
}

/**
 * Trimmed and lower-cased, then NFC last so the result is NFC even where lower-casing
 * decomposes (U+0130 becomes "i" plus a combining dot). Applying it twice changes nothing.
 */
export function normaliseIdentifier(identifier: string): NormalisedIdentifier {
  return identifier
    .trim()
    .toLowerCase()
    .normalize('NFC') as NormalisedIdentifier;
}

/**
 * Any "@" means an email address. The sign-up username rule must therefore refuse "@", or such
 * a username could never sign in by username.
 */
export function identifierKind(
  identifier: NormalisedIdentifier,
): IdentifierKind {
  return identifier.includes('@') ? 'email' : 'username';
}
