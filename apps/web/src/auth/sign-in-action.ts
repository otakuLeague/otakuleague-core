'use server';

import { isSignInResponse } from '@otakuleague/shared-types';
import { cookies, headers } from 'next/headers';
import { sessionCookie } from './auth-cookies';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { redirectTo } from './redirect-to';
import { reportClientIpUnknown } from './report-credential-refusal';
import { safeNextPath } from './safe-next-path';
import {
  readSignInFields,
  signInOutcomeFrom,
  type SignInFormState,
} from './sign-in-form-state';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * The sign-in form's Server Action (ADR 0015): at most one credential call, then the session
 * cookie and a redirect to a safe `next`, or a form state that never echoes what was typed. A
 * request whose `Origin` is not exactly ours (login CSRF; missing or `null` included) is refused
 * before the form is read, as `unavailable`: a real browser always sends it, so only a forged or
 * mangled request lands there, and a visitor can cause it at will, so it is not reported. The
 * previous state is ignored (a client can forge it). No try/catch: `redirectTo` throws Next's
 * redirect signal, and a configuration error must surface, never read as a sign-in.
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
  const outcome = signInOutcomeFrom(callResult);
  if (outcome.kind === 'failed') {
    return outcome.formState;
  }
  const { name, options } = sessionCookie(webPublicUrl);
  (await cookies()).set(name, outcome.sessionToken, options);
  redirectTo(safeNextPath(formData.get('next'), webPublicUrl));
}
