'use server';

import { isSignUpResponse } from '@otakuleague/shared-types';
import { cookies, headers } from 'next/headers';
import { flashCookie, signUpCookie } from './auth-cookies';
import {
  authCallFaultOf,
  reportAuthCallFault,
  reportClientIpUnknown,
} from './auth-reports';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { flashEmailFrom } from './flash-email';
import { redirectToCheckEmail } from './redirect-to';
import {
  readSignUpFields,
  signUpOutcomeFrom,
  type SignUpFormState,
} from './sign-up-form-state';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * The sign-up form's Server Action (ADR 0015 Addenda 1f-v and 1f-v2): at most one credential call,
 * then `ol_signup` (the binding, ADR 0020), `ol_flash` (the address, display only) and "Check your
 * email", or a form state that never echoes what was typed. Like `signInAction`: a preview, then
 * `isSameOrigin` before the form is read (sign-up CSRF: a foreign page must not plant its binding
 * here), the previous state ignored (a client can forge it), only a fault or `client_ip_unknown`
 * reported. It never reads a cookie, the session or `next`. A refusal writes nothing. No try/catch:
 * the redirect is Next's signal, and a configuration error must surface, never read as a sign-up.
 */
export async function signUpAction(
  _previousState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'off_on_preview' };
  }
  const webPublicUrl = readWebPublicUrl(process.env);
  if (!isSameOrigin((await headers()).get('origin'), webPublicUrl)) {
    return { kind: 'unavailable' };
  }
  const fields = readSignUpFields(formData);
  if (fields.kind === 'invalid_fields') {
    return fields;
  }
  const callResult = await credentialCall({
    path: '/auth/sign-up',
    body: fields.request,
    isExpectedBody: isSignUpResponse,
  });
  if (
    callResult.kind === 'refused' &&
    callResult.reason === 'client_ip_unknown'
  ) {
    reportClientIpUnknown('sign-up');
  }
  const fault =
    callResult.kind === 'called' && !callResult.result.ok
      ? authCallFaultOf(callResult.result.failure)
      : undefined;
  if (fault !== undefined) {
    reportAuthCallFault('sign-up', fault);
  }
  const outcome = signUpOutcomeFrom(callResult);
  if (outcome.kind === 'failed') {
    return outcome.formState;
  }
  const jar = await cookies();
  const binding = signUpCookie(webPublicUrl);
  jar.set(binding.name, outcome.bindingToken, binding.options);
  const flash = flashCookie(webPublicUrl);
  jar.set(flash.name, flashEmailFrom(fields.request.email), flash.options);
  redirectToCheckEmail();
}
