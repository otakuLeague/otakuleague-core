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
