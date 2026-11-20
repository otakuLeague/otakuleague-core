import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';
import type { ApiFailure } from '../api/client';

// Server only (next/server): never import this from src/observability/sentry.ts, which the
// browser bundle loads.

/** The credential routes that can report a refusal; each later action adds its own. */
export type CredentialRoute = 'sign-in';

/** One report per server instance every 10 minutes: a broken header refuses every visitor at once. */
export const REFUSAL_REPORT_INTERVAL_MS = 600_000;

// One throttle for the whole instance, not one per route, on purpose: every route shares the
// fingerprint, and the cause is the same platform header whichever route sees it first.
let instanceLastReportedAtMs: number | undefined;

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
 * or not one address, so sign-in is down for everyone until it is fixed (never `action_forwarded`,
 * which a visitor can cause at will). The event carries the
 * route only (never an IP, a header or a form field) and is flushed after the response, since a
 * serverless instance can freeze before Sentry's queue drains.
 */
export function reportClientIpUnknown(
  route: CredentialRoute,
  nowMs: number = Date.now(),
): void {
  if (!isRefusalReportDue(instanceLastReportedAtMs, nowMs)) {
    return;
  }
  instanceLastReportedAtMs = nowMs;
  Sentry.captureMessage('Credential call refused: client IP unknown', {
    level: 'error',
    tags: { credential_route: route },
    fingerprint: ['credential-call-client-ip-unknown'],
  });
  after(() => Sentry.flush(2000));
}

/** The auth routes that can see an `AuthCallFault` (ADR 0015 Addendum 1f-iv). */
export type AuthCallRoute = 'sign-in' | 'sign-out' | 'me';

/** A misconfiguration a visitor cannot cause: the key refused, a body off contract, a throw. */
export type AuthCallFault =
  'internal_key_refused' | 'invalid_response' | 'configuration';

/**
 * Network, timeout, 429 and 5xx are no fault (an outage, which the API or the platform reports),
 * nor any other 4xx. A non-envelope 5xx is a proxy's error page, so it stays an outage too.
 */
export function authCallFaultOf(
  failure: ApiFailure,
): AuthCallFault | undefined {
  if (failure.kind === 'invalid_response') {
    return failure.status < 500 ? 'invalid_response' : undefined;
  }
  return failure.kind === 'api_error' &&
    failure.status === 403 &&
    failure.error.error.code === 'INTERNAL_KEY_REQUIRED'
    ? 'internal_key_refused'
    : undefined;
}

// One throttle per fault kind, so one fault never hides another; shared by every route.
const faultLastReportedAtMs = new Map<AuthCallFault, number>();

/**
 * At most one Sentry error per fault kind per instance every 10 minutes, carrying the route and the
 * fault as tags and nothing else (never a token, a username, an IP or an error message).
 */
export function reportAuthCallFault(
  route: AuthCallRoute,
  fault: AuthCallFault,
  nowMs: number = Date.now(),
): void {
  if (!isRefusalReportDue(faultLastReportedAtMs.get(fault), nowMs)) {
    return;
  }
  faultLastReportedAtMs.set(fault, nowMs);
  // Never thrown: a report must not break the render it describes (loadViewer, ADR 0015 N2).
  try {
    Sentry.captureMessage('Auth call fault', {
      level: 'error',
      tags: { auth_route: route, auth_fault: fault },
      fingerprint: ['auth-call-fault', fault],
    });
    after(() => Sentry.flush(2000));
  } catch {
    return;
  }
}
