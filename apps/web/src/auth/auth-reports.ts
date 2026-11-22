import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';
import type { ApiFailure } from '../api/client';

// Server only (next/server): never import this from src/observability/sentry.ts, which the
// browser bundle loads.

/** The credential routes that can report a refusal; each later action adds its own. */
export type CredentialRoute = 'sign-in' | 'sign-up';

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
 * or not one address, so every credential route is down for everyone until it is fixed (never
 * `action_forwarded`, which a visitor can cause at will). The event carries the route only (never
 * an IP, a header or a form field) and is flushed after the response, since a serverless instance
 * can freeze before Sentry's queue drains.
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
    // `auth_route`, never `credential_route`: the event scrubber masks keys matching `credential`.
    tags: { auth_route: route },
    fingerprint: ['credential-call-client-ip-unknown'],
  });
  after(() => Sentry.flush(2000));
}

/** The auth routes that can see an `AuthCallFault` (ADR 0015 Addendum 1f-iv). */
export type AuthCallRoute = 'sign-in' | 'sign-up' | 'sign-out' | 'me';

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

/**
 * A fault, or a sign-out whose revocation the API did not confirm (anything but 204, a 401 envelope
 * or a fault: an outage, a 429, another 4xx). Only `deleteSession` reports the latter (1f-iv-b2).
 */
export type AuthReportKind = AuthCallFault | 'revocation_unconfirmed';

// One throttle per kind, so an outage never hides a misconfiguration or the reverse; shared by every route.
const kindLastReportedAtMs = new Map<AuthReportKind, number>();

/**
 * At most one Sentry error per kind per instance every 10 minutes. Our tags are the route and the
 * kind only (never a token, a username, an IP or an error message); the SDK adds its stack and
 * request context, which `scrubErrorEvent` strips of the query and the user.
 */
export function reportAuthCallFault(
  route: AuthCallRoute,
  kind: AuthReportKind,
  nowMs: number = Date.now(),
): void {
  if (!isRefusalReportDue(kindLastReportedAtMs.get(kind), nowMs)) {
    return;
  }
  kindLastReportedAtMs.set(kind, nowMs);
  // Never thrown: a report must not break the render it describes (loadViewer, ADR 0015 N2).
  try {
    Sentry.captureMessage('Auth call fault', {
      level: 'error',
      tags: { auth_route: route, auth_fault: kind },
      fingerprint: ['auth-call-fault', kind],
    });
    after(() => Sentry.flush(2000));
  } catch {
    return;
  }
}
