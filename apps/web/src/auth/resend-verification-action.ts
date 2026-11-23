'use server';

import {
  isEmailVerificationResendResponse,
  type EmailVerificationResendRequest,
} from '@otakuleague/shared-types';
import { headers } from 'next/headers';
import {
  authCallFaultOf,
  reportAuthCallFault,
  reportClientIpUnknown,
} from './auth-reports';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { readFlashEmail } from './flash-email';
import {
  resendVerificationStateFrom,
  type ResendVerificationState,
} from './resend-verification-state';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * "Resend email" on "Check your email" (ADR 0015 Addendum 1f-vii decision 3), in the order of
 * `confirmEmailAction`: preview, `isSameOrigin` (unreported), then the address from
 * `readFlashEmail()` only (none or implausible: `no_address`, 0 calls), then exactly one credential
 * call with `{ email }`, never retried: each resend kills the previous link and counts against the
 * IP's limit. Takes no input, like `signOutAction`: what `useActionState` passes (a previous state, a
 * FormData) is ignored, so a cross-site request cannot choose the address; a script that sets its
 * own Cookie and Origin can, which public sign-up already allows, and the API's per-IP limit is the
 * bound. Writes no cookie, reads no session, never redirects. No try/catch: a configuration error
 * must surface.
 */
export async function resendVerificationAction(): Promise<ResendVerificationState> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'off_on_preview' };
  }
  const webPublicUrl = readWebPublicUrl(process.env);
  if (!isSameOrigin((await headers()).get('origin'), webPublicUrl)) {
    return { kind: 'unavailable' };
  }
  const email = await readFlashEmail();
  if (email === undefined) {
    return { kind: 'no_address' };
  }
  const body: EmailVerificationResendRequest = { email };
  const callResult = await credentialCall({
    path: '/auth/email-verification/resend',
    body,
    isExpectedBody: isEmailVerificationResendResponse,
  });
  if (
    callResult.kind === 'refused' &&
    callResult.reason === 'client_ip_unknown'
  ) {
    reportClientIpUnknown('email-resend');
  }
  const fault =
    callResult.kind === 'called' && !callResult.result.ok
      ? authCallFaultOf(callResult.result.failure)
      : undefined;
  if (fault !== undefined) {
    reportAuthCallFault('email-resend', fault);
  }
  return resendVerificationStateFrom(callResult);
}
