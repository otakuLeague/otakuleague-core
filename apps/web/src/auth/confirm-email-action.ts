'use server';

import {
  isEmailVerificationConfirmResponse,
  type EmailVerificationConfirmRequest,
} from '@otakuleague/shared-types';
import { cookies, headers } from 'next/headers';
import { clearedVerifyCookie, verifyCookie } from './auth-cookies';
import {
  authCallFaultOf,
  reportAuthCallFault,
  reportClientIpUnknown,
} from './auth-reports';
import {
  confirmEmailOutcomeFrom,
  readConfirmEmailPassword,
  type ConfirmEmailFormState,
} from './confirm-email-form-state';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { wellFormedAuthToken } from './email-link';
import {
  CONFIRM_EMAIL_LANDINGS,
  redirectToConfirmEmailLanding,
} from './redirect-to';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * The password page's Server Action (ADR 0015 Addendum 1f-vi decision 9), mirroring `signInAction`:
 * preview, `isSameOrigin` before the form is read (unreported), the password's bounds, then the
 * emailed token from the verify cookie under its configured name only (missing or malformed:
 * `try-again` with 0 calls, since the link itself still works), then one credential call with
 * `{ token, password }` and no binding. Only an answer for the token for good (confirmed, or dead)
 * clears the cookie (`Max-Age=0`, never `delete()`) before the redirect; a wrong password, a limit or
 * an outage keeps it and shows a state. It never reads, sets or revokes a session: only the binding
 * gives one. The previous state is ignored (a client can forge it). No try/catch: the redirect is
 * Next's signal, and a configuration error must surface.
 */
export async function confirmEmailAction(
  _previousState: ConfirmEmailFormState,
  formData: FormData,
): Promise<ConfirmEmailFormState> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'off_on_preview' };
  }
  const webPublicUrl = readWebPublicUrl(process.env);
  if (!isSameOrigin((await headers()).get('origin'), webPublicUrl)) {
    return { kind: 'unavailable' };
  }
  const password = readConfirmEmailPassword(formData);
  if (password === undefined) {
    return { kind: 'wrong_password' };
  }
  const jar = await cookies();
  const token = wellFormedAuthToken(
    jar.get(verifyCookie(webPublicUrl).name)?.value,
  );
  if (token === undefined) {
    redirectToConfirmEmailLanding(CONFIRM_EMAIL_LANDINGS.tryAgain);
  }
  // Never the binding: with it the API would answer a session, which this path never sets.
  const body: EmailVerificationConfirmRequest = { token, password };
  const callResult = await credentialCall({
    path: '/auth/email-verification/confirm',
    body,
    isExpectedBody: isEmailVerificationConfirmResponse,
  });
  if (
    callResult.kind === 'refused' &&
    callResult.reason === 'client_ip_unknown'
  ) {
    reportClientIpUnknown('email-confirm');
  }
  const fault =
    callResult.kind === 'called' && !callResult.result.ok
      ? authCallFaultOf(callResult.result.failure)
      : undefined;
  if (fault !== undefined) {
    reportAuthCallFault('email-confirm', fault);
  }
  const outcome = confirmEmailOutcomeFrom(callResult);
  if (outcome.kind === 'failed') {
    return outcome.formState;
  }
  const cleared = clearedVerifyCookie(webPublicUrl);
  jar.set(cleared.name, '', cleared.options);
  redirectToConfirmEmailLanding(
    outcome.kind === 'confirmed'
      ? CONFIRM_EMAIL_LANDINGS.confirmed
      : CONFIRM_EMAIL_LANDINGS.expired,
  );
}
