import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, SHARED_SENTRY_OPTIONS } from './src/observability/sentry';

export function register(): void {
  // No Edge routes or middleware yet, so only the Node.js runtime reports.
  if (process.env.NEXT_RUNTIME === 'nodejs' && SENTRY_DSN !== undefined) {
    Sentry.init({
      ...SHARED_SENTRY_OPTIONS,
      includeServerName: false,
      // Server breadcrumbs could mix two visitors' requests; the error and its route are enough.
      maxBreadcrumbs: 0,
    });
  }
}

// Server rendering and route handler errors. Returns at once: flushing only happens inside
// waitUntil, a no-op outside Vercel and Cloudflare (ADR 0004).
export const onRequestError = Sentry.captureRequestError;
