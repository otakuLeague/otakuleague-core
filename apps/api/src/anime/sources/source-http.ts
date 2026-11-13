import type { AnimeDataSource } from '@otakuleague/shared-types';
import type { RateLimiter } from './rate-limiter';
import { SourceUnavailableError, UnusableAnswerError } from './source.types';

export interface SourceHttpOptions {
  readonly source: AnimeDataSource;
  readonly limiter: RateLimiter;
  readonly timeoutMs: number;
  /** A Retry-After longer than this gives up instead of holding the request. */
  readonly maxRetryAfterMs: number;
  /** After a failure, calls fail at once for this long. */
  readonly coolDownMs: number;
  /** Longest wait for a free slot before giving up ("queue full"). */
  readonly maxQueueMs: number;
  readonly now?: () => number;
  /** Largest response body read, in bytes (default 1 MiB). */
  readonly maxBodyBytes?: number;
}

export interface SourceResponse {
  readonly status: number;
  readonly body: unknown;
}

const DEFAULT_RETRY_AFTER_MS = 60_000;
const MAX_ATTEMPTS = 2;
const MAX_BODY_BYTES = 1_048_576;

type CappedBody =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'too_large' };

/**
 * Reads the body as text, stopping at `limit` bytes: a Content-Length above the limit is
 * refused before reading, and a stream (also one without Content-Length) is cancelled as soon
 * as it passes the limit. Peak memory is about three times the body: the chunks, their
 * joined copy and the decoded string.
 */
async function readCappedBody(
  response: Response,
  limit: number,
): Promise<CappedBody> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isInteger(declared) && declared > limit) {
    await response.body?.cancel();
    return { kind: 'too_large' };
  }
  if (response.body === null) return { kind: 'read', text: '' };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return { kind: 'too_large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'read', text: new TextDecoder().decode(bytes) };
}

/** Seconds ("30") or an HTTP date; anything else is the default. */
export function retryAfterMs(header: string | null, now: number): number {
  if (header === null) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  if (header.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? DEFAULT_RETRY_AFTER_MS : Math.max(0, date - now);
}

/**
 * One rate-limited JSON request. 2xx and 404 come back to the adapter; a 429 waits for
 * Retry-After and tries once more; anything else (5xx, timeout, network, non-JSON) throws
 * SourceUnavailableError and starts the cool-down. A body over `maxBodyBytes` (1 MiB by
 * default) throws UnusableAnswerError without a cool-down: one bad answer, not a down source.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
  options: SourceHttpOptions,
): Promise<SourceResponse> {
  const now = options.now ?? Date.now;
  const fail = (reason: string, downForMs = options.coolDownMs): never => {
    options.limiter.markDown(downForMs);
    throw new SourceUnavailableError(options.source, reason);
  };
  for (let attempt = 1; ; attempt += 1) {
    if (options.limiter.isDown()) {
      throw new SourceUnavailableError(
        options.source,
        'cooling down after a failure',
        attempt > 1,
      );
    }
    // A full queue is not the source's fault: refuse this call, do not start a cool-down.
    if (!(await options.limiter.acquire(options.maxQueueMs))) {
      throw new SourceUnavailableError(
        options.source,
        'queue full',
        attempt > 1,
      );
    }
    // The source may have gone down while this call was queued.
    if (options.limiter.isDown()) {
      throw new SourceUnavailableError(
        options.source,
        'cooling down after a failure',
        attempt > 1,
      );
    }
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      return fail(error instanceof Error ? error.name : 'network error');
    }
    if (response.status === 429) {
      const delay = retryAfterMs(response.headers.get('retry-after'), now());
      options.limiter.pauseUntil(now() + delay);
      await response.body?.cancel();
      if (attempt < MAX_ATTEMPTS && delay <= options.maxRetryAfterMs) continue;
      // Down at least until Retry-After ends, so nobody queues up behind the pause.
      return fail(
        `rate limited for ${delay} ms`,
        Math.max(options.coolDownMs, delay),
      );
    }
    if (response.status !== 404 && !response.ok) {
      await response.body?.cancel();
      return fail(`HTTP ${response.status}`);
    }
    let capped: CappedBody;
    try {
      capped = await readCappedBody(
        response,
        options.maxBodyBytes ?? MAX_BODY_BYTES,
      );
    } catch (error) {
      return fail(error instanceof Error ? error.name : 'network error');
    }
    if (capped.kind === 'too_large') {
      throw new UnusableAnswerError(options.source, 'response body too large');
    }
    try {
      return {
        status: response.status,
        body: JSON.parse(capped.text) as unknown,
      };
    } catch {
      return fail('response is not JSON');
    }
  }
}
