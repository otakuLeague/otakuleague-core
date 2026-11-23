import type { Metadata } from 'next';
import { SIGN_UP_COOKIE_MAX_AGE_SECONDS } from '../../../../src/auth/auth-cookies';
import { EmailLinkScreen } from '../email-link-screen';

/** The link dies with the pending sign-up (ADR 0015 Addendum 1f-v), so after that only a new sign-up helps. */
const LINK_HOURS = SIGN_UP_COOKIE_MAX_AGE_SECONDS / 3600;

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: "This link doesn't work anymore" };

/** A dead, used or malformed link (OTA-139 1f-vi-b). No resend field until 1f-vii. */
export default function ExpiredPage() {
  return (
    <EmailLinkScreen
      tone="wait"
      heading="This link doesn't work anymore"
      sentence={`It has expired, was already used or is incomplete. Open the link in our newest email, or sign up again if it has been over ${LINK_HOURS} hours.`}
      link={{ href: '/auth', label: 'Back to sign in', look: 'back' }}
    />
  );
}
