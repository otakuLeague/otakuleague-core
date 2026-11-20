'use server';

import { isSignInResponse } from '@otakuleague/shared-types';
import { cookies } from 'next/headers';
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
import { readWebPublicUrl } from './web-public-url';

/**
 * The sign-in form's Server Action (ADR 0015): at most one credential call, then the session
 * cookie and a redirect to a safe `next`, or a form state that never echoes what was typed. The
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
  const webPublicUrl = readWebPublicUrl(process.env);
  const { name, options } = sessionCookie(webPublicUrl);
  (await cookies()).set(name, outcome.sessionToken, options);
  redirectTo(safeNextPath(formData.get('next'), webPublicUrl));
}
