const API_BASE_URL_HINT =
  'Set it in the repo-root .env to an absolute http(s) URL without credentials, query or fragment, e.g. API_BASE_URL=http://127.0.0.1:3001.';

/** Reads API_BASE_URL from server-side configuration, never from user input. */
export function readApiBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string {
  return parseApiBaseUrl(env.API_BASE_URL);
}

/**
 * Validates an API base URL and returns it without a trailing slash, so `${base}${path}` never
 * doubles or drops one. Throws one message that never echoes the value, which could carry credentials.
 */
export function parseApiBaseUrl(rawValue: string | undefined): string {
  const rawBaseUrl = rawValue?.trim();
  if (rawBaseUrl === undefined || rawBaseUrl === '') {
    throw new Error(
      `Invalid web configuration: API_BASE_URL is missing. ${API_BASE_URL_HINT}`,
    );
  }
  const baseUrl = URL.parse(rawBaseUrl);
  if (
    baseUrl === null ||
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    baseUrl.username !== '' ||
    baseUrl.password !== '' ||
    baseUrl.search !== '' ||
    baseUrl.hash !== ''
  ) {
    throw new Error(
      `Invalid web configuration: API_BASE_URL is invalid. ${API_BASE_URL_HINT}`,
    );
  }
  return `${baseUrl.origin}${baseUrl.pathname.replace(/\/+$/, '')}`;
}

// The API's own rule (ADR 0019 item 1); `openssl rand -hex 32` gives 64 characters.
const INTERNAL_API_KEY_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

/** Reads INTERNAL_API_KEY (ADR 0019): server-only, never inlined in a bundle. Unset means no key. */
export function readInternalApiKey(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return parseInternalApiKey(env.INTERNAL_API_KEY);
}

/** Empty means unset. The message names the variable and never echoes the value, a secret. */
export function parseInternalApiKey(
  rawValue: string | undefined,
): string | undefined {
  const key = rawValue?.trim();
  if (key === undefined || key === '') {
    return undefined;
  }
  if (!INTERNAL_API_KEY_PATTERN.test(key)) {
    throw new Error(
      'Invalid web configuration: INTERNAL_API_KEY is invalid. Use 43 to 128 characters of A-Z a-z 0-9 _ - (openssl rand -hex 32), or leave it empty.',
    );
  }
  return key;
}

// Exact addresses, so `127.0.0.1.evil.example` is not loopback. Not `localhost`: a name is resolved
// (hosts file, DNS), so it may not stay on this machine.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]']);

/** Where the internal key may go: HTTPS, or plain HTTP that never leaves this machine. */
export function isSecureApiBaseUrl(baseUrl: string): boolean {
  const url = URL.parse(baseUrl);
  return (
    url !== null &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)))
  );
}

/** Throws unless the key may be sent to `baseUrl`; the message never echoes the URL or the key. */
export function assertKeyMayGoTo(baseUrl: string): void {
  if (!isSecureApiBaseUrl(baseUrl)) {
    throw new Error(
      'Invalid web configuration: INTERNAL_API_KEY is set but API_BASE_URL is neither https nor loopback (127.0.0.1, [::1]).',
    );
  }
}

/**
 * Run by next.config.ts, so a bad key or an insecure API_BASE_URL fails the deploy instead of every
 * request. Key unset: nothing is read or checked, as before slice 2.
 */
export function checkInternalApiKeyConfig(
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (readInternalApiKey(env) !== undefined) {
    assertKeyMayGoTo(readApiBaseUrl(env));
  }
}
