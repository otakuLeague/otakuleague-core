import {
  isEmailVerificationConfirmResponse,
  type EmailVerificationConfirmRequest,
} from '@otakuleague/shared-types';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import {
  clearedSignUpCookie,
  sessionCookie,
  signUpCookie,
  verifyCookie,
} from './auth-cookies';
import {
  authCallFaultOf,
  reportAuthCallFault,
  reportClientIpUnknown,
} from './auth-reports';
import { credentialCall, credentialRoutesOff } from './credential-call';
import { deleteSession } from './delete-session';
import {
  EMAIL_LINK_LANDINGS,
  emailLinkTokenFrom,
  landingOf,
  verifyLinkOutcomeFrom,
  wellFormedAuthToken,
} from './email-link';
import { seeOther } from './see-other';
import { readSessionToken } from './session-call';
import { readWebPublicUrl } from './web-public-url';

/**
 * `GET /auth/verify?token=` (ADR 0015 Addendum 1f-vi), total: every answer, a throw included, is
 * `seeOther(landing)`. A preview or a malformed token makes no call and reads no cookie. Then the
 * binding (`ol_signup`, configured name only, sent only when well-formed) and the old session are
 * read, and one credential call goes out (5,000 ms, never retried). Cookies come only from an
 * answer the guard accepted: a session (old one revoked first, `ol_signup` cleared) on `verified`
 * with a session, `ol_verify` on `confirmation_required`, nothing otherwise. No `isSameOrigin`: a
 * click from a mail has no `Origin`; the binding is the guard. Only a fault, a throw and
 * `client_ip_unknown` are reported, never the token. A throw passes `unstable_rethrow` (Next's
 * signals, the prerender stop) and lands on `try-again`: an error page would keep the token in the
 * address bar.
 */
export async function verifyEmailLink(request: Request): Promise<Response> {
  try {
    // First: with cacheComponents a GET handler is prerendered until it touches the request.
    const { searchParams } = new URL(request.url);
    if (credentialRoutesOff(process.env)) {
      return seeOther(EMAIL_LINK_LANDINGS.preview);
    }
    const token = emailLinkTokenFrom(searchParams);
    if (token === undefined) {
      return seeOther(EMAIL_LINK_LANDINGS.expired);
    }
    const webPublicUrl = readWebPublicUrl(process.env);
    const jar = await cookies();
    const bindingToken = wellFormedAuthToken(
      jar.get(signUpCookie(webPublicUrl).name)?.value,
    );
    const oldSession = await readSessionToken(webPublicUrl);
    const body: EmailVerificationConfirmRequest =
      bindingToken === undefined ? { token } : { token, bindingToken };
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
    const outcome = verifyLinkOutcomeFrom(callResult);
    if (outcome.kind === 'signed_in') {
      // The API created the new session already: keeping the old cookie would orphan the old one.
      if (oldSession !== undefined) {
        await deleteSession(oldSession);
      }
      const session = sessionCookie(webPublicUrl);
      jar.set(session.name, outcome.sessionToken, session.options);
      const binding = clearedSignUpCookie(webPublicUrl);
      jar.set(binding.name, '', binding.options);
    } else if (outcome.kind === 'confirmation_required') {
      const verify = verifyCookie(webPublicUrl);
      jar.set(verify.name, token, verify.options);
    }
    return seeOther(landingOf(outcome));
  } catch (cause) {
    unstable_rethrow(cause);
    reportAuthCallFault('email-confirm', 'configuration');
    return seeOther(EMAIL_LINK_LANDINGS.tryAgain);
  }
}
