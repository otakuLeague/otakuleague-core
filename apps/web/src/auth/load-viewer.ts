import { isMeResponse } from '@otakuleague/shared-types';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { authCallFaultOf, reportAuthCallFault } from './auth-reports';
import { credentialRoutesOff } from './credential-call';
import {
  hasSessionCookie,
  readSessionToken,
  sessionCall,
} from './session-call';
import { viewerFrom, type Viewer } from './viewer';
import { readWebPublicUrl } from './web-public-url';

/** `GET /me` must answer within 2 s: the header never waits on the viewer (ADR 0015 N1). */
export const VIEWER_TIMEOUT_MS = 2000;

/**
 * The viewer for a render, never thrown (only Next's control-flow signals pass): previews, and
 * requests with neither session cookie name, are signed out before `WEB_PUBLIC_URL` is read (F7:
 * guest links whatever the configuration), no or a malformed token under the configured name costs
 * no call, else exactly one `GET /me`. A configuration throw is reported and `unavailable` (only a
 * cookie holder gets that far). Reads cookies, never writes or deletes one. Never inside
 * 'use cache': `connection()` throws there, reported as `configuration`.
 */
export async function loadViewer(): Promise<Viewer> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'signed_out' };
  }
  try {
    // Request time only: a prerender stops here, before the cookies or the configuration are read.
    // `cookies()` would leave a prerender too, but this is the line that keeps everything below out
    // of the build: without it, a refactor that reads WEB_PUBLIC_URL before the cookie would throw
    // at build time, be caught below, and prerender `unavailable` for every visitor (1f-iv-c2).
    await connection();
    if (!(await hasSessionCookie())) {
      return { kind: 'signed_out' };
    }
    const session = await readSessionToken(readWebPublicUrl(process.env));
    if (session === undefined) {
      return { kind: 'signed_out' };
    }
    const callResult = await sessionCall({
      session,
      path: '/me',
      isExpectedBody: isMeResponse,
      timeoutMs: VIEWER_TIMEOUT_MS,
    });
    const fault =
      callResult.kind === 'called' && !callResult.result.ok
        ? authCallFaultOf(callResult.result.failure)
        : undefined;
    if (fault !== undefined) {
      reportAuthCallFault('me', fault);
    }
    return viewerFrom(callResult);
  } catch (cause) {
    unstable_rethrow(cause);
    reportAuthCallFault('me', 'configuration');
    return { kind: 'unavailable' };
  }
}
