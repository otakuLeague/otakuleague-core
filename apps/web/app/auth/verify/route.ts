import { verifyEmailLink } from '../../../src/auth/verify-email-link';

// The mailed link (EMAIL_VERIFICATION_LINK, ADR 0015 Addendum 1f-vi): always a 303. Only GET:
// other methods get Next's 405.
export function GET(request: Request): Promise<Response> {
  return verifyEmailLink(request);
}
