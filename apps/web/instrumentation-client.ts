import { scrubBreadcrumb } from '@otakuleague/shared-types';
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, SHARED_SENTRY_OPTIONS } from './src/observability/sentry';

if (SENTRY_DSN !== undefined) {
  Sentry.init({
    ...SHARED_SENTRY_OPTIONS,
    // Console output can hold anything; URLs lose their query.
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    // Noise that is not a bug of ours and would eat the free-tier quota: browser quirks, a visitor
    // going offline, and chunks deleted by a deploy while a tab was open.
    ignoreErrors: [
      /^ResizeObserver loop/,
      /Failed to fetch|Load failed|NetworkError|ChunkLoadError|Loading chunk \S+ failed/,
    ],
    denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//],
  });
}
