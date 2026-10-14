// Redaction applied to every API log line and every Sentry event, in the API and the web app (ADR 0004).
// It runs on attacker-controlled text (request paths), so every rule must stay near-linear:
// strings are capped first, and no rule rescans a long run of characters from each position.

const REDACTED = '[redacted]';
const MAX_TEXT_LENGTH = 8192;

const SENSITIVE_KEY =
  /passw(?:or)?d|^pwd$|secret|token|authorization|^auth$|cookie|api[-_]?key|private[-_]?key|session|credential|jwt|^otp$|^dsn$/i;

// Compound names too (passwordHash, refresh_token_hash, secretKey): word characters around the keyword.
const KEY_VALUE =
  /([\w-]{0,32}(?:passw(?:or)?d|pwd|secret|token|api[-_]?key|private[-_]?key|authorization|cookie|session[-_]?id|jwt|otp|dsn)[\w-]{0,32})(["']?\s{0,8}[:=]\s{0,8})("[^"\n]{0,256}"|'[^'\n]{0,256}'|[^\s"',;&}]{1,4096})/gi;

// Credentials in any URL, such as a database connection string; runs to the last `@`
// so a password with an unencoded `@` is masked whole.
const URL_CREDENTIALS = /\b([a-z][a-z\d+.-]{0,30}:\/\/)[^\s/?#]{1,256}@/gi;

// Header-style credentials: capitalised scheme and a value of 8+ characters.
const AUTH_SCHEME = /\b(Bearer|Basic|Token) ([\w~+/.=-]{8,4096})/g;
// A digit, a capital or a base64 symbol, so "Basic validation failed" stays readable.
const CREDENTIAL_SHAPE = /[\dA-Z+/=]/;

// JSON Web Tokens: the text is split into runs first, then each run is tested once.
const WORD_RUN = /[\w.-]{10,}/g;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;

// The domain must end in a letters-only TLD, so pnpm paths such as `core@12.1.3_x` are kept.
const EMAIL = /[\w.+-]{1,64}@(?:[a-z\d-]{1,63}\.){1,8}[a-z]{2,24}\b/gi;

function maskValue(value: string): string {
  const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : '';
  return `${quote}${REDACTED}${quote}`;
}

/**
 * Masks credentials, tokens and email addresses found in free text, and cuts text longer than
 * 8 KB (a log line or event field never needs more).
 * ponytail: shape-based, so a secret in prose with no recognizable key or prefix gets through;
 * the real guard is never logging raw headers, bodies, query strings or secrets in URL paths.
 */
export function redactText(text: string): string {
  const capped =
    text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH)}[truncated]`
      : text;
  return capped
    .replace(URL_CREDENTIALS, `$1${REDACTED}@`)
    .replace(AUTH_SCHEME, (match, scheme: string, value: string) =>
      CREDENTIAL_SHAPE.test(value) ? `${scheme} ${REDACTED}` : match,
    )
    .replace(WORD_RUN, (run) => (JWT.test(run) ? REDACTED : run))
    .replace(EMAIL, '[email]')
    .replace(
      KEY_VALUE,
      (_match, key: string, separator: string, value: string) =>
        `${key}${separator}${maskValue(value)}`,
    );
}

// Values JSON.stringify would not print field by field; kept as they are.
function isOpaque(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof Map ||
    value instanceof Set ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer
  );
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object' || value === null || isOpaque(value)) {
    return value;
  }
  // Loggers print an error's stack (which starts with its message) rather than its fields.
  if (value instanceof Error) return redactText(value.stack ?? value.message);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  // Any other object, including class instances such as validated DTOs, is walked like JSON.stringify would.
  const redacted = Array.isArray(value)
    ? value.map((entry: unknown) => redactUnknown(entry, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          SENSITIVE_KEY.test(key) ? REDACTED : redactUnknown(entry, seen),
        ]),
      );
  seen.delete(value);
  return redacted;
}

/**
 * Returns a copy where sensitive keys are masked and every string goes through redactText.
 * Class instances become plain objects, errors become their redacted stack.
 */
export function redactValue<T>(value: T): T {
  return redactUnknown(value, new WeakSet()) as T;
}

interface ErrorEventRequest {
  readonly method?: string;
  readonly url?: string;
}

function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0] ?? '';
}

/**
 * Sentry `beforeSend`: keeps only the method and the URL without query or fragment from the
 * request, drops the user, then redacts the whole event. Structural, so this package does not
 * depend on Sentry.
 */
export function scrubErrorEvent<
  E extends { readonly request?: ErrorEventRequest; readonly user?: unknown },
>(event: E): E {
  const { request } = event;
  return redactValue({
    ...event,
    user: undefined,
    request: request && {
      method: request.method,
      url: request.url && withoutQuery(request.url),
    },
  });
}

const BREADCRUMB_URL_KEYS = ['from', 'to', 'url'];

/**
 * Sentry `beforeBreadcrumb` for the browser: drops console breadcrumbs (whatever was logged)
 * and the query and fragment of navigation and fetch URLs. Returns null to drop a breadcrumb.
 */
export function scrubBreadcrumb<
  B extends {
    readonly category?: string;
    readonly data?: Record<string, unknown>;
  },
>(breadcrumb: B): B | null {
  if (breadcrumb.category === 'console') return null;
  const { data } = breadcrumb;
  if (data === undefined) return breadcrumb;
  return {
    ...breadcrumb,
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        BREADCRUMB_URL_KEYS.includes(key) && typeof value === 'string'
          ? withoutQuery(value)
          : value,
      ]),
    ),
  };
}

/**
 * Sentry `dataCollection` for every app (ADR 0004): nothing about the visitor, the request
 * or local variables is collected. Shared so the API and the web app cannot drift apart.
 */
export const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
  queues: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  // No source lines around stack frames: they can hold literals, and source maps are off anyway.
  frameContextLines: 0,
};
