import {
  PRIVATE_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubErrorEvent,
} from '@otakuleague/shared-types';
import * as Sentry from '@sentry/nextjs';

// Literal process.env reads: Next inlines them at build time (NEXT_PUBLIC_ and next.config `env`).
// No DSN means no Sentry.init call, so every capture is a no-op (ADR 0004).
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/** Options shared by the web server and the browser: privacy first, no tracing, no Replay. */
export const SHARED_SENTRY_OPTIONS = {
  dsn: SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE || undefined,
  dataCollection: PRIVATE_DATA_COLLECTION,
  beforeSend: (event) => scrubErrorEvent(event),
} satisfies Parameters<typeof Sentry.init>[0];

/**
 * Same-origin route the browser sends envelopes to, so blockers of sentry.io do not drop them
 * (OTA-87). A neutral word: filter lists match paths like /sentry, /monitoring or /tunnel.
 */
export const SENTRY_TUNNEL_PATH = '/hikari';

/** Browser options; scrubbing runs in beforeSend, before the envelope reaches the tunnel. */
export const BROWSER_SENTRY_OPTIONS = {
  ...SHARED_SENTRY_OPTIONS,
  tunnel: SENTRY_TUNNEL_PATH,
  // Console output can hold anything; URLs lose their query.
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  // Noise that is not a bug of ours and would eat the free-tier quota: browser quirks, a visitor
  // going offline, and chunks deleted by a deploy while a tab was open.
  ignoreErrors: [
    /^ResizeObserver loop/,
    /Failed to fetch|Load failed|NetworkError|ChunkLoadError|Loading chunk \S+ failed/,
  ],
  denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//],
} satisfies Parameters<typeof Sentry.init>[0];

/** For error boundaries. An error with a digest was thrown on the server, which already reported it. */
export function reportRenderError(
  error: Error & { readonly digest?: string },
): void {
  if (error.digest === undefined) {
    Sentry.captureException(error);
  }
}
