import { isMeResponse } from '@otakuleague/shared-types';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { credentialRoutesOff } from './credential-call';
import {
  authCallFaultOf,
  reportAuthCallFault,
} from './report-credential-refusal';
import { readSessionToken, sessionCall } from './session-call';
import { viewerFrom, type Viewer } from './viewer';
import { readWebPublicUrl } from './web-public-url';

/** `GET /me` must answer within 2 s: the header never waits on the viewer (ADR 0015 N1). */
export const VIEWER_TIMEOUT_MS = 2000;

/**
 * The viewer for a render, never thrown (only Next's control-flow signals pass): previews are
 * signed out before `WEB_PUBLIC_URL` is read, no or a malformed cookie costs no call, else exactly
 * one `GET /me`. A configuration throw is reported and `unavailable`. Reads the cookie, never
 * writes or deletes one. Never inside 'use cache': `connection()` throws there, reported as
 * `configuration`.
 */
export async function loadViewer(): Promise<Viewer> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'signed_out' };
  }
  try {
    // Request time only: a prerender stops here, before the configuration is read.
    await connection();
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
