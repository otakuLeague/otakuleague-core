import * as Sentry from '@sentry/nextjs';
import { BROWSER_SENTRY_OPTIONS, SENTRY_DSN } from './src/observability/sentry';

if (SENTRY_DSN !== undefined) {
  Sentry.init(BROWSER_SENTRY_OPTIONS);
}
