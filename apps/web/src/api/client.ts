import { isApiError, type ApiError } from '@otakuleague/shared-types';
import { unstable_rethrow } from 'next/navigation';
import type { ClientIp } from './client-ip';
import {
  isSecureApiBaseUrl,
  parseApiBaseUrl,
  parseInternalApiKey,
  readApiBaseUrl,
  readInternalApiKey,
} from './config';

// The only module in apps/web that touches the network (lint rule in eslint.config.mjs, ADR 0003).
// Expected failures are returned, never thrown; a throw here is a programming or config error.

export type ApiFailure =
  | {
      readonly kind: 'api_error';
      readonly status: number;
      readonly error: ApiError;
    }
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'invalid_response'; readonly status: number };

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: ApiFailure };

export type FetchFunction = typeof fetch;

/**
 * An absolute API path, appended to the base URL. The leading `/` (checked at runtime too) keeps
 * `@host` or `.host` from joining the base's authority; `.` and `..` segments are rejected so a
 * path cannot climb out of a base path prefix. Encode dynamic segments with encodeURIComponent.
 */
export type ApiPath = `/${string}`;

export interface CallOptions<T> {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. */
  readonly body?: unknown;
  readonly timeoutMs?: number;
  /** Defaults to 'no-store' unless `next.revalidate` is set; the caching policy is OTA-86. */
  readonly cache?: RequestCache;
  readonly next?: NextFetchRequestConfig;
  /** Checks a 2xx body. Without it the body is trusted by type (ADR 0003). */
  readonly isExpectedBody?: (body: unknown) => body is T;
  /**
   * The visitor's IP from `readClientIp()`, only on a call that can start an import (ADR 0019).
   * Sent as X-Client-Ip only with the internal key. Refused on a cached call: a per-visitor header
   * would split Next's data cache by visitor.
   */
  readonly clientIp?: ClientIp;
}

export interface ApiClientSettings {
  /** From configuration only, never from user input. Validated like API_BASE_URL. */
  readonly baseUrl: string;
  readonly fetch?: FetchFunction;
  readonly defaultTimeoutMs?: number;
  /** INTERNAL_API_KEY, sent as X-Internal-Api-Key on every call; needs an HTTPS or loopback base URL. */
  readonly internalApiKey?: string;
}

export interface ApiClient {
  call<T>(path: ApiPath, options?: CallOptions<T>): Promise<ApiResult<T>>;
}

export const DEFAULT_TIMEOUT_MS = 5000;

type ParsedBody =
  | { readonly kind: 'json'; readonly body: unknown }
  | { readonly kind: 'not_json' };

type RawResponse =
  | {
      readonly ok: true;
      readonly status: number;
      readonly parsedBody: ParsedBody;
    }
  | { readonly ok: false; readonly failure: ApiFailure };

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/** Throws on a path that is not absolute or has a `.`/`..` segment (a backslash is a separator in http URLs). */
function assertSafePath(path: string): void {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  if (
    !path.startsWith('/') ||
    // URL parsing strips tab, LF and CR before resolving dot segments, so `.\t.` would become `..`.
    /[\t\n\r]/.test(path) ||
    pathname.split(/[/\\]/).some((segment) => DOT_SEGMENT.test(segment))
  ) {
    throw new Error(
      'API path must start with "/" and contain no "." or ".." segment or control character',
    );
  }
}

function assertTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('API timeout must be a positive integer of milliseconds');
  }
}

/** Throws whether or not a key is set, so a test without one still catches the mistake. */
function assertClientIpUncached<T>(options: CallOptions<T>): void {
  const cached =
    options.next?.revalidate !== undefined ||
    (options.cache !== undefined && options.cache !== 'no-store');
  if (options.clientIp !== undefined && cached) {
    throw new Error('clientIp is only allowed on an uncached (no-store) call');
  }
}

/** The client IP goes only with the key: the API ignores it from a caller it cannot trust. */
function requestHeaders(
  hasBody: boolean,
  internalApiKey: string | undefined,
  clientIp: ClientIp | undefined,
): Record<string, string> {
  return {
    accept: 'application/json',
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
    ...(internalApiKey === undefined
      ? {}
      : {
          'x-internal-api-key': internalApiKey,
          ...(clientIp === undefined ? {} : { 'x-client-ip': clientIp }),
        }),
  };
}

/** An empty body is valid only on 204 and 205, which carry none by definition. */
function parseJson(status: number, text: string): ParsedBody {
  if (text === '') {
    return status === 204 || status === 205
      ? { kind: 'json', body: undefined }
      : { kind: 'not_json' };
  }
  try {
    return { kind: 'json', body: JSON.parse(text) as unknown };
  } catch {
    return { kind: 'not_json' };
  }
}

function isTimeout(cause: unknown): boolean {
  // AbortSignal.timeout rejects with a DOMException named TimeoutError; checked by name, not class.
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    cause.name === 'TimeoutError'
  );
}

function toFailureResult<T>(apiFailure: ApiFailure): ApiResult<T> {
  return { ok: false, failure: apiFailure };
}

/** Copies only the contract fields, so extra keys a server adds (stack, debug) never reach a page. */
function copyApiError({ error }: ApiError): ApiError {
  return error.code === 'VALIDATION_FAILED'
    ? {
        error: {
          code: error.code,
          message: error.message,
          details: error.details.map(({ field, message }) => ({
            field,
            message,
          })),
        },
      }
    : { error: { code: error.code, message: error.message } };
}

/** Non-2xx: the error envelope if the body is one, otherwise invalid_response. The raw body is never kept. */
function toErrorResult<T>(
  status: number,
  parsedBody: ParsedBody,
): ApiResult<T> {
  if (parsedBody.kind === 'json' && isApiError(parsedBody.body)) {
    return toFailureResult({
      kind: 'api_error',
      status,
      error: copyApiError(parsedBody.body),
    });
  }
  return toFailureResult({ kind: 'invalid_response', status });
}

export function createApiClient(settings: ApiClientSettings): ApiClient {
  const baseUrl = parseApiBaseUrl(settings.baseUrl);
  const fetchFunction = settings.fetch ?? fetch;
  const defaultTimeoutMs = settings.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertTimeout(defaultTimeoutMs);
  const internalApiKey = parseInternalApiKey(settings.internalApiKey);
  if (internalApiKey !== undefined && !isSecureApiBaseUrl(baseUrl)) {
    // Plain HTTP across a network would show the key to every hop on the way.
    throw new Error(
      'Invalid web configuration: INTERNAL_API_KEY is set but API_BASE_URL is neither https nor loopback (127.0.0.1, localhost, [::1]).',
    );
  }

  async function send<T>(
    path: ApiPath,
    options: CallOptions<T>,
  ): Promise<RawResponse> {
    assertSafePath(path);
    assertClientIpUncached(options);
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    assertTimeout(timeoutMs);
    // Built before the try: a body that cannot be serialized is a programming error, not a network one.
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers: requestHeaders(
        body !== undefined,
        internalApiKey,
        options.clientIp,
      ),
      body,
      cache:
        options.cache ??
        (options.next?.revalidate === undefined ? 'no-store' : undefined),
      next: options.next,
      redirect: 'error',
      // Covers the body read below too, so a stalled body also times out.
      signal: AbortSignal.timeout(timeoutMs),
    };
    try {
      const response = await fetchFunction(`${baseUrl}${path}`, init);
      const parsedBody = parseJson(response.status, await response.text());
      return { ok: true, status: response.status, parsedBody };
    } catch (cause) {
      // Next.js control flow (prerender bailouts, notFound) must reach Next, not become "network".
      unstable_rethrow(cause);
      return {
        ok: false,
        failure: isTimeout(cause) ? { kind: 'timeout' } : { kind: 'network' },
      };
    }
  }

  async function call<T>(
    path: ApiPath,
    options: CallOptions<T> = {},
  ): Promise<ApiResult<T>> {
    const raw = await send(path, options);
    if (!raw.ok) {
      return toFailureResult(raw.failure);
    }
    const { status, parsedBody } = raw;
    if (status < 200 || status > 299) {
      return toErrorResult(status, parsedBody);
    }
    if (
      parsedBody.kind === 'not_json' ||
      (options.isExpectedBody !== undefined &&
        !options.isExpectedBody(parsedBody.body))
    ) {
      return toFailureResult({ kind: 'invalid_response', status });
    }
    // Trusted by type when no guard is given: the documented risk in ADR 0003.
    return { ok: true, data: parsedBody.body as T };
  }

  return { call };
}

let defaultClient: ApiClient | undefined;

/** The app-wide client, built on first use so a missing or invalid variable fails with its own message. */
export function apiClient(): ApiClient {
  defaultClient ??= createApiClient({
    baseUrl: readApiBaseUrl(process.env),
    internalApiKey: readInternalApiKey(process.env),
  });
  return defaultClient;
}
