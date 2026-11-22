import type { WebPublicUrl } from './web-public-url';

/**
 * 180 days: keep equal to `SESSION_MAX_AGE_MS` in apps/api/src/auth/session-rules.ts, the API's
 * hard stop for a session (ADR 0015); the API still refuses an idle one sooner.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

const HTTPS_SESSION_COOKIE_NAME = '__Host-ol_session';
const HTTP_SESSION_COOKIE_NAME = 'ol_session';

/**
 * Both names the session cookie can have, for a presence check only (`hasSessionCookie`, ADR 0015
 * Addendum 1f-iv-c decision 5). The token is read under `sessionCookie(webPublicUrl).name` only.
 */
export const SESSION_COOKIE_NAMES = [
  HTTPS_SESSION_COOKIE_NAME,
  HTTP_SESSION_COOKIE_NAME,
] as const;

/** The session cookie's name and attributes, ready for `cookies().set(name, value, options)`. */
export interface SessionCookie {
  readonly name: (typeof SESSION_COOKIE_NAMES)[number];
  readonly options: {
    readonly httpOnly: true;
    readonly secure: boolean;
    readonly sameSite: 'lax';
    readonly path: '/';
    readonly maxAge: number;
  };
}

/**
 * `__Host-` with `Secure` on https, so no subdomain or plain-http page can set or shadow it; plain
 * `ol_session` on http, which `readWebPublicUrl` allows only on loopback (browsers drop a `Secure`
 * cookie there). Never a `Domain`: the cookie stays on this exact host.
 */
export function sessionCookie({ isHttps }: WebPublicUrl): SessionCookie {
  return {
    name: isHttps ? HTTPS_SESSION_COOKIE_NAME : HTTP_SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    },
  };
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
