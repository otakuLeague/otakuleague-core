import { unstable_rethrow } from 'next/navigation';
import type { SessionToken } from '../api/session-token';
import {
  authCallFaultOf,
  reportAuthCallFault,
} from './report-credential-refusal';
import { sessionCall } from './session-call';

/** `POST /auth/sign-out` must answer within 2 s: sign-out and sign-in never wait longer (ADR 0015 N3, N6). */
export const SESSION_DELETE_TIMEOUT_MS = 2000;

/**
 * The one caller of `POST /auth/sign-out` (ADR 0015 Addendum 1f-iv-b): exactly one attempt, never
 * retried, and total (only Next's control-flow signals pass). 204 and 401 both mean the session is
 * gone; an outage leaves the row to idle out; a fault is reported, and a throw (a missing key) is
 * reported as `configuration`, so the caller still clears or replaces the cookie. The route tag is
 * the API route called, so a delete inside sign-in reports as `sign-out`.
 */
export async function deleteSession(session: SessionToken): Promise<void> {
  try {
    const callResult = await sessionCall({
      session,
      path: '/auth/sign-out',
      method: 'POST',
      timeoutMs: SESSION_DELETE_TIMEOUT_MS,
    });
    const fault =
      callResult.kind === 'called' && !callResult.result.ok
        ? authCallFaultOf(callResult.result.failure)
        : undefined;
    if (fault !== undefined) {
      reportAuthCallFault('sign-out', fault);
    }
  } catch (cause) {
    unstable_rethrow(cause);
    reportAuthCallFault('sign-out', 'configuration');
  }
}
