'use server';

import { isSignInResponse } from '@otakuleague/shared-types';
import { cookies, headers } from 'next/headers';
import { sessionCookie } from './auth-cookies';
import {
  authCallFaultOf,
  reportAuthCallFault,
  reportClientIpUnknown,
} from './auth-reports';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { deleteSession } from './delete-session';
import { redirectTo } from './redirect-to';
import { safeNextPath } from './safe-next-path';
import { readSessionToken } from './session-call';
import {
  readSignInFields,
  signInOutcomeFrom,
  type SignInFormState,
} from './sign-in-form-state';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * The sign-in form's Server Action (ADR 0015): at most one credential call, then the session
 * cookie and a redirect to a safe `next`, or a form state that never echoes what was typed. Next
 * already aborts an action whose `Origin` is `null` or names another host; `isSameOrigin`, before
 * the form is read, also refuses a missing `Origin` and a real browser on a host that is not
 * `WEB_PUBLIC_URL` (a vercel.app alias, a second domain, a stale value after cutover). That case
 * shows `unavailable` and is not reported (a visitor can cause it at will). The previous state is
 * ignored (a client can forge it). A called and failed sign-in is reported only for a fault
 * (`authCallFaultOf`: the key refused, a body off contract), never for what the visitor's input
 * decides or for an outage (ADR 0015 Addendum 1f-iv-b2). Only after a success, and only with a
 * well-formed old cookie, `deleteSession` revokes the old session first (one session call,
 * 2,000 ms, never fatal). No try/catch: `redirectTo` throws Next's redirect signal, and a
 * configuration error must surface, never read as a sign-in.
 */
export async function signInAction(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'off_on_preview' };
  }
  const webPublicUrl = readWebPublicUrl(process.env);
  if (!isSameOrigin((await headers()).get('origin'), webPublicUrl)) {
    return { kind: 'unavailable' };
  }
  const fields = readSignInFields(formData);
  if (fields === undefined) {
    return { kind: 'invalid_credentials' };
  }
  const oldSession = await readSessionToken(webPublicUrl);
  const callResult = await credentialCall({
    path: '/auth/sign-in',
    body: fields,
    isExpectedBody: isSignInResponse,
  });
  if (
    callResult.kind === 'refused' &&
    callResult.reason === 'client_ip_unknown'
  ) {
    reportClientIpUnknown('sign-in');
  }
  const fault =
    callResult.kind === 'called' && !callResult.result.ok
      ? authCallFaultOf(callResult.result.failure)
      : undefined;
  if (fault !== undefined) {
    reportAuthCallFault('sign-in', fault);
  }
  const outcome = signInOutcomeFrom(callResult);
  if (outcome.kind === 'failed') {
    return outcome.formState;
  }
  // Only after a success, and never fatal: the API already accepted this sign-in (ADR 0015 N6).
  if (oldSession !== undefined) {
    await deleteSession(oldSession);
  }
  const { name, options } = sessionCookie(webPublicUrl);
  (await cookies()).set(name, outcome.sessionToken, options);
  redirectTo(safeNextPath(formData.get('next'), webPublicUrl));
}
