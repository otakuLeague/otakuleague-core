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

/**
 * Read on first use by the auth code, never at build, so a deploy without it still serves public
 * pages. Server configuration only, never user input.
 */
export function readWebPublicUrl(
  env: Readonly<Record<string, string | undefined>>,
): WebPublicUrl {
  return parseWebPublicUrl(env.WEB_PUBLIC_URL);
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
  // `href` is the origin plus `/` only when nothing else is there, even an empty `?` or `#`.
  if (
    url === null ||
    !(isHttps || isLocalHttp) ||
    url.href !== `${url.origin}/`
  ) {
    throw new Error(
      `Invalid web configuration: WEB_PUBLIC_URL is invalid. ${WEB_PUBLIC_URL_HINT}`,
    );
  }
  return { origin: url.origin, isHttps };
}
