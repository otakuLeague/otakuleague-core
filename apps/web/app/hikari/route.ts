import { SENTRY_DSN } from '../../src/observability/sentry';
import { forwardSentryEnvelope } from '../../src/observability/sentry-tunnel';

// The Sentry tunnel (SENTRY_TUNNEL_PATH, OTA-87). Only POST: other methods get Next's 405.
export function POST(request: Request): Promise<Response> {
  return forwardSentryEnvelope(request, { dsn: SENTRY_DSN });
}
