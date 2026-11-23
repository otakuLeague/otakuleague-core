import type { WebPublicUrl } from './web-public-url';

/**
 * 180 days: keep equal to `SESSION_MAX_AGE_MS` in apps/api/src/auth/session-rules.ts, the API's
 * hard stop for a session (ADR 0015); the API still refuses an idle one sooner.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/**
 * 24 h: keep equal to `PENDING_SIGN_UP_TTL_MS` in apps/api/src/auth/sign-up-rules.ts, how long the
 * verification token the binding goes with lives (ADR 0015 Addendum 1f-v).
 */
export const SIGN_UP_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/** 10 minutes: the "Check your email" screen reads the address right after the redirect. */
const FLASH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/** 10 minutes: the password page of an emailed link reads its token right after the redirect. */
const VERIFY_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const SESSION_COOKIE_NAME = 'ol_session';

/**
 * Both names the session cookie can have, for a presence check only (`hasSessionCookie`, ADR 0015
 * Addendum 1f-iv-c decision 5). The token is read under `sessionCookie(webPublicUrl).name` only.
 */
export const SESSION_COOKIE_NAMES = [
  `__Host-${SESSION_COOKIE_NAME}`,
  SESSION_COOKIE_NAME,
] as const;

/** An auth cookie's name and attributes, ready for `cookies().set(name, value, options)`. */
export interface AuthCookie<PlainName extends string> {
  readonly name: `__Host-${PlainName}` | PlainName;
  readonly options: {
    readonly httpOnly: true;
    readonly secure: boolean;
    readonly sameSite: 'lax';
    readonly path: '/';
    readonly maxAge: number;
  };
}

export type SessionCookie = AuthCookie<typeof SESSION_COOKIE_NAME>;

/**
 * One naming rule for every auth cookie (ADR 0015 Addendum 1f-v): `__Host-` with `Secure` on https,
 * so no subdomain or plain-http page can set or shadow it; the plain name on http, which
 * `readWebPublicUrl` allows only on loopback (browsers drop a `Secure` cookie there). Never a
 * `Domain`: the cookie stays on this exact host.
 */
function authCookie<PlainName extends string>(
  plainName: PlainName,
  maxAge: number,
  { isHttps }: WebPublicUrl,
): AuthCookie<PlainName> {
  return {
    name: isHttps ? `__Host-${plainName}` : plainName,
    options: {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge,
    },
  };
}

export function sessionCookie(webPublicUrl: WebPublicUrl): SessionCookie {
  return authCookie(
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_MAX_AGE_SECONDS,
    webPublicUrl,
  );
}

/**
 * `ol_signup`: the sign-up's `bindingToken`, so only this browser confirms in one click (ADR 0020).
 * Written only by the sign-up action, on a 2xx (the API answers 202) that passed `isSignUpResponse`.
 */
export function signUpCookie(
  webPublicUrl: WebPublicUrl,
): AuthCookie<'ol_signup'> {
  return authCookie('ol_signup', SIGN_UP_COOKIE_MAX_AGE_SECONDS, webPublicUrl);
}

/**
 * The binding with `Max-Age=0`, written by the link handler only once its token was consumed
 * there (ADR 0015 Addendum 1f-vi decision 6). Never `cookies().delete()`: no `Secure`, so a
 * browser would keep a `__Host-` cookie.
 */
export function clearedSignUpCookie(
  webPublicUrl: WebPublicUrl,
): AuthCookie<'ol_signup'> {
  return authCookie('ol_signup', 0, webPublicUrl);
}

/**
 * `ol_verify`: an emailed token, taken out of the address bar for the password page, written only
 * on `confirmation_required` (ADR 0015 Addendum 1f-vi). Alone it confirms nothing: the sign-up
 * password must go with it.
 */
export function verifyCookie(
  webPublicUrl: WebPublicUrl,
): AuthCookie<'ol_verify'> {
  return authCookie('ol_verify', VERIFY_COOKIE_MAX_AGE_SECONDS, webPublicUrl);
}

/**
 * `ol_flash`: the address "Check your email" shows (at most 254 characters), and the one 1f-vii
 * resends to: that is why it keeps `__Host-`, so a sibling host cannot choose it.
 */
export function flashCookie(
  webPublicUrl: WebPublicUrl,
): AuthCookie<'ol_flash'> {
  return authCookie('ol_flash', FLASH_COOKIE_MAX_AGE_SECONDS, webPublicUrl);
}

/**
 * The same cookie with `Max-Age=0`, for `cookies().set(name, '', options)`. Never
 * `cookies().delete()` for this cookie: it sends no `Secure`, and browsers ignore a `__Host-`
 * cookie without it, so the stale session would stay.
 */
export function clearedSessionCookie(
  webPublicUrl: WebPublicUrl,
): SessionCookie {
  const { name, options } = sessionCookie(webPublicUrl);
  return { name, options: { ...options, maxAge: 0 } };
}
