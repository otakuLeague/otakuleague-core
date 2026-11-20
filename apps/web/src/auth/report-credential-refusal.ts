import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';

// Server only (next/server): never import this from src/observability/sentry.ts, which the
// browser bundle loads.

/** The credential routes that can report a refusal; each later action adds its own. */
export type CredentialRoute = 'sign-in';

/** One report per server instance every 10 minutes: a broken header refuses every visitor at once. */
export const REFUSAL_REPORT_INTERVAL_MS = 600_000;

let lastReportAtMs: number | undefined;

export function isRefusalReportDue(
  lastReportedAtMs: number | undefined,
  nowMs: number,
): boolean {
  return (
    lastReportedAtMs === undefined ||
    nowMs - lastReportedAtMs >= REFUSAL_REPORT_INTERVAL_MS
  );
}

/**
 * `client_ip_unknown` on a credential route: on Vercel the platform's `x-forwarded-for` was missing
 * or not one address, so sign-in is down for everyone until it is fixed. The event carries the
 * route only (never an IP, a header or a form field) and is flushed after the response, since a
 * serverless instance can freeze before Sentry's queue drains.
 */
export function reportClientIpUnknown(
  route: CredentialRoute,
  nowMs: number = Date.now(),
): void {
  if (!isRefusalReportDue(lastReportAtMs, nowMs)) {
    return;
  }
  lastReportAtMs = nowMs;
  Sentry.captureMessage('Credential call refused: client IP unknown', {
    level: 'error',
    tags: { credential_route: route },
    fingerprint: ['credential-call-client-ip-unknown'],
  });
  after(() => Sentry.flush(2000));
}
