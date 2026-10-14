// The only file besides src/api/client.ts allowed to call fetch: it forwards browser envelopes to
// Sentry, not to our API (ADR 0003 addendum, OTA-87).

/** Browser error envelopes are a few KB; the cap bounds the memory one request can take. */
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
/** Upper bound on one forward. The browser sends in the background, so this never holds a page. */
export const FORWARD_TIMEOUT_MS = 5000;
/** A body trickled slower than this is dropped, so a slow client cannot hold a slot. */
export const READ_TIMEOUT_MS = 10_000;
/**
 * Requests handled at once, per server process: bounds memory (about MAX_IN_FLIGHT MiB) and
 * outbound calls. Above it the event is dropped with 503; the page is not affected.
 */
export const MAX_IN_FLIGHT = 20;

// Sent back to the browser SDK so it respects Sentry's rate limits.
const PASSED_THROUGH_HEADERS = ['retry-after', 'x-sentry-rate-limits'];

interface TunnelOptions {
  /** NEXT_PUBLIC_SENTRY_DSN; undefined when Sentry is off. */
  readonly dsn: string | undefined;
  readonly timeoutMs?: number;
  readonly readTimeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxInFlight?: number;
}

type BodyRead =
  | { readonly kind: 'ok'; readonly body: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'too-slow' }
  | { readonly kind: 'unreadable' };

const REJECTED_BODY_STATUS = {
  'too-large': 413,
  'too-slow': 408,
  unreadable: 400,
} as const;

let inFlight = 0;

interface SentryProject {
  readonly host: string;
  readonly projectId: string;
  readonly envelopeUrl: string;
}

/**
 * Forwards one envelope to our own Sentry project, and nowhere else: the target URL is built from
 * the configured DSN, never from the request. Never throws.
 */
export async function forwardSentryEnvelope(
  request: Request,
  {
    dsn,
    timeoutMs = FORWARD_TIMEOUT_MS,
    readTimeoutMs = READ_TIMEOUT_MS,
    maxBytes = MAX_ENVELOPE_BYTES,
    maxInFlight = MAX_IN_FLIGHT,
  }: TunnelOptions,
): Promise<Response> {
  const ownProject = dsn === undefined ? undefined : parseDsn(dsn);
  if (ownProject === undefined) return status(404);
  if (inFlight >= maxInFlight) return status(503);

  inFlight += 1;
  try {
    return await checkAndForward(request, ownProject, {
      timeoutMs,
      readTimeoutMs,
      maxBytes,
    });
  } finally {
    inFlight -= 1;
  }
}

async function checkAndForward(
  request: Request,
  ownProject: SentryProject,
  limits: { timeoutMs: number; readTimeoutMs: number; maxBytes: number },
): Promise<Response> {
  const read = await readBody(request, limits.maxBytes, limits.readTimeoutMs);
  if (read.kind !== 'ok') return status(REJECTED_BODY_STATUS[read.kind]);
  const { body } = read;

  const envelopeDsn = envelopeHeaderDsn(body);
  const envelopeProject =
    envelopeDsn === undefined ? undefined : parseDsn(envelopeDsn);
  if (envelopeProject === undefined) return status(400);
  if (
    envelopeProject.host !== ownProject.host ||
    envelopeProject.projectId !== ownProject.projectId
  ) {
    return status(403);
  }

  try {
    const upstream = await fetch(ownProject.envelopeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
      // A redirect would send the envelope somewhere the configured DSN did not name.
      redirect: 'error',
      signal: AbortSignal.timeout(limits.timeoutMs),
    });
    const headers = new Headers();
    for (const name of PASSED_THROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    // An unread body keeps the pooled connection busy until garbage collection.
    await upstream.body?.cancel();
    return new Response(null, { status: upstream.status, headers });
  } catch (error) {
    // Sentry down, unreachable or too slow: the event is lost, the page is not affected.
    return status(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 504
        : 502,
    );
  }
}

function status(code: number): Response {
  return new Response(null, { status: code });
}

/** `https://<key>@<host>[/<path>]/<projectId>` -> host and envelope endpoint; undefined if invalid. */
function parseDsn(dsn: string): SentryProject | undefined {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return undefined;
  }
  const segments = url.pathname.split('/');
  const projectId = segments.pop() ?? '';
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username === '' ||
    !/^\d+$/.test(projectId)
  ) {
    return undefined;
  }
  const pathPrefix = segments.join('/');
  return {
    host: url.host,
    projectId,
    envelopeUrl: `${url.protocol}//${url.host}${pathPrefix}/api/${projectId}/envelope/`,
  };
}

/** Reads at most maxBytes within readTimeoutMs, whatever Content-Length claims. */
async function readBody(
  request: Request,
  maxBytes: number,
  readTimeoutMs: number,
): Promise<BodyRead> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return { kind: 'too-large' };
  if (request.body === null) return { kind: 'unreadable' };

  const reader = request.body.getReader();
  let timedOut = false;
  // Cancelling ends the pending read with done: true; the flag tells it apart from a real end.
  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => undefined);
  }, readTimeoutMs);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) return { kind: 'too-slow' };
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: timedOut ? 'too-slow' : 'unreadable' };
  } finally {
    clearTimeout(timer);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'ok', body };
}

/** The envelope header is the JSON object on the first line; the SDK puts the DSN in it. */
function envelopeHeaderDsn(body: Uint8Array): string | undefined {
  const newline = body.indexOf(0x0a);
  if (newline === -1) return undefined;
  try {
    const header: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        body.subarray(0, newline),
      ),
    );
    if (typeof header !== 'object' || header === null || !('dsn' in header)) {
      return undefined;
    }
    return typeof header.dsn === 'string' ? header.dsn : undefined;
  } catch {
    return undefined;
  }
}
