import { unstable_rethrow } from 'next/navigation';
import type { ApiFailure } from '../api/client';
import type { SessionToken } from '../api/session-token';
import { authCallFaultOf, reportAuthCallFault } from './auth-reports';
import { sessionCall } from './session-call';

/** `POST /auth/sign-out` must answer within 2 s: sign-out and sign-in never wait longer (ADR 0015 N3, N6). */
const SESSION_DELETE_TIMEOUT_MS = 2000;

/**
 * The one caller of `POST /auth/sign-out` (ADR 0015 Addendum 1f-iv-b2): exactly one attempt, never
 * retried, and total (only Next's control-flow signals pass). 204 and a 401 envelope both mean the
 * session is gone; any other answer is one report, the fault when there is one, else
 * `revocation_unconfirmed` (an outage, a 429, another 4xx: the row idles out); a throw (a missing
 * key) is `configuration`; a preview refusal made no call. The caller still clears or replaces the
 * cookie. The route tag is the API route called, so a delete inside sign-in reports as `sign-out`.
 */
export async function deleteSession(session: SessionToken): Promise<void> {
  try {
    const callResult = await sessionCall({
      session,
      path: '/auth/sign-out',
      method: 'POST',
      timeoutMs: SESSION_DELETE_TIMEOUT_MS,
    });
    const failure =
      callResult.kind === 'called' && !callResult.result.ok
        ? callResult.result.failure
        : undefined;
    if (failure !== undefined && !isSessionGone(failure)) {
      reportAuthCallFault(
        'sign-out',
        authCallFaultOf(failure) ?? 'revocation_unconfirmed',
      );
    }
  } catch (cause) {
    unstable_rethrow(cause);
    reportAuthCallFault('sign-out', 'configuration');
  }
}

/** A 401 envelope: the session was already gone (expired, replayed or revoked). */
function isSessionGone(failure: ApiFailure): boolean {
  return failure.kind === 'api_error' && failure.status === 401;
}
