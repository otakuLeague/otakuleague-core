import { isSessionToken } from '@otakuleague/shared-types';

declare const sessionTokenBrand: unique symbol;

/** A session cookie's value, checked before it is sent as `Authorization: Bearer` (ADR 0015). */
export type SessionToken = string & { readonly [sessionTokenBrand]: true };

/**
 * The only maker of the brand: 43 base64url characters, else nothing. Not trimmed, so a value with
 * a space, CR/LF, `;` or a `Bearer ` prefix never reaches a header; the API decides if it is live.
 */
export function sessionTokenFrom(
  value: string | undefined,
): SessionToken | undefined {
  return value !== undefined && isSessionToken(value)
    ? (value as SessionToken)
    : undefined;
}
