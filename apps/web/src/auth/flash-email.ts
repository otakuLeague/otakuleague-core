import { IDENTIFIER_MAX } from '@otakuleague/shared-types';
import { cookies } from 'next/headers';
import { flashCookie } from './auth-cookies';
import { readWebPublicUrl, type WebPublicUrl } from './web-public-url';

/**
 * Visible ASCII (U+0021 to U+007E) but "@" (U+0040) and capitals (U+0041 to U+005A) on each side of
 * exactly one "@", so at least 3 characters. Linear: neither class holds "@", nothing backtracks.
 */
const FLASH_EMAIL_PATTERN = /^[\x21-\x3f\x5b-\x7e]+@[\x21-\x3f\x5b-\x7e]+$/;

/**
 * The flash value only when it could be an address the sign-up action wrote (ADR 0015 Addendum
 * 1f-v2 decision 3): a string of 3 to `IDENTIFIER_MAX` characters, else nothing. Not the API's email
 * rule: it is displayed, and posted to the resend route (1f-vii), where the API's EmailAddress rule
 * validates it; this already stops spaces, control and bidi characters and look-alike letters a
 * planted cookie could carry. Markup characters (`<`, `>`, `"`, `'`, `&`) pass: the answer is safe
 * only as React text or a JSON body field, never in an attribute, HTML, a URL or a header.
 */
export function plausibleFlashEmail(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= IDENTIFIER_MAX &&
    FLASH_EMAIL_PATTERN.test(value)
    ? value
    : undefined;
}

/**
 * The flash the sign-up action writes: the typed address trimmed, lower-cased and NFC, as the API's
 * `normaliseIdentifier` does, so after a 202 it is the address the API mails (ADR 0015 Addendum
 * 1f-v2 decision 3) and passes `plausibleFlashEmail`. Anything the API refuses never gets a 202.
 */
export function flashEmailFrom(typed: string): string {
  return typed.trim().toLowerCase().normalize('NFC');
}

/**
 * The address "Check your email" shows, never thrown (only Next's signals pass, from `cookies()`,
 * where a prerender stops). Read under the configured name only (`__Host-ol_flash` on https: a
 * sibling host cannot choose it). Never sets or clears the cookie; its 600 s end it.
 */
export async function readFlashEmail(): Promise<string | undefined> {
  const jar = await cookies();
  const webPublicUrl = configuredWebPublicUrl();
  if (webPublicUrl === undefined) {
    return undefined;
  }
  return plausibleFlashEmail(jar.get(flashCookie(webPublicUrl).name)?.value);
}

/**
 * A configuration throw is no address, unreported: the action that writes the flash throws on the
 * same error, so a holder here has a planted cookie or one from before the change.
 */
function configuredWebPublicUrl(): WebPublicUrl | undefined {
  try {
    return readWebPublicUrl(process.env);
  } catch {
    return undefined;
  }
}
