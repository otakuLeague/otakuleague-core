import {
  PRIVATE_DATA_COLLECTION,
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

/** For error boundaries. An error with a digest was thrown on the server, which already reported it. */
export function reportRenderError(
  error: Error & { readonly digest?: string },
): void {
  if (error.digest === undefined) {
    Sentry.captureException(error);
  }
}
