/** Password length bounds in code points after NFC (ADR 0015, parity with the old site). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Longest identifier: an email address is at most 254 characters (RFC 5321 path limit). */
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

/** Code points after NFC: a combining accent or an emoji counts once, as a person would count. */
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
