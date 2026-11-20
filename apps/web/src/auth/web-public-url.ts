/** The web's own origin (ADR 0015): names the session cookie, later checks `next` and `Origin`. */
export interface WebPublicUrl {
  /** Scheme, host and port only, no trailing slash: `https://beta.otakuleague.com`. */
  readonly origin: string;
  readonly isHttps: boolean;
}

const WEB_PUBLIC_URL_HINT =
  "Set it to the web's own origin with no path, query, fragment or credentials: https://<host>, or http only for localhost, 127.0.0.1 or [::1] (e.g. WEB_PUBLIC_URL=http://localhost:3000).";

// Exact hostnames, so `localhost.evil.example` or `127.0.0.1.evil.example` is not loopback. Plain
// http is allowed there only because the cookie never leaves the machine.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

const INVALID_MESSAGE = `Invalid web configuration: WEB_PUBLIC_URL is invalid. ${WEB_PUBLIC_URL_HINT}`;

/**
 * Read on first use by the auth code, never at build, so a deploy without it still serves public
 * pages. Server configuration only, never user input. On Vercel (`VERCEL=1`) only https: no
 * visitor reaches a loopback origin there, and the cookie must keep `Secure` and `__Host-`.
 */
export function readWebPublicUrl(
  env: Readonly<Record<string, string | undefined>>,
): WebPublicUrl {
  const webPublicUrl = parseWebPublicUrl(env.WEB_PUBLIC_URL);
  if (env.VERCEL === '1' && !webPublicUrl.isHttps) {
    throw new Error(INVALID_MESSAGE);
  }
  return webPublicUrl;
}

/** Throws one message that names the variable and never echoes the value. */
export function parseWebPublicUrl(rawValue: string | undefined): WebPublicUrl {
  const raw = rawValue?.trim();
  if (raw === undefined || raw === '') {
    throw new Error(
      `Invalid web configuration: WEB_PUBLIC_URL is missing. ${WEB_PUBLIC_URL_HINT}`,
    );
  }
  const url = URL.parse(raw);
  const isHttps = url?.protocol === 'https:';
  const isLocalHttp =
    url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  // The input itself must be the origin, so nothing the parser normalises away (`/.`, `https:host`,
  // an empty `?` or `#`, a default port, upper case) slips through; a trailing-dot host is another origin.
  if (
    url === null ||
    !(isHttps || isLocalHttp) ||
    !(raw === url.origin || raw === `${url.origin}/`) ||
    url.hostname.endsWith('.')
  ) {
    throw new Error(INVALID_MESSAGE);
  }
  return { origin: url.origin, isHttps };
}

/**
 * Login CSRF guard for the auth actions: the request's `Origin` header must be exactly our origin.
 * A missing header, `null` (an opaque origin) or any other origin is refused (deny by default).
 */
export function isSameOrigin(
  originHeader: string | null,
  { origin }: WebPublicUrl,
): boolean {
  return originHeader === origin;
}
