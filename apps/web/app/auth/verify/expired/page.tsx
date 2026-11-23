import type { Metadata } from 'next';
import { EmailLinkScreen } from '../email-link-screen';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: "This link doesn't work anymore" };

/** A dead, used or malformed link (OTA-139 1f-vi-b). No resend field until 1f-vii. */
export default function ExpiredPage() {
  return (
    <EmailLinkScreen
      tone="wait"
      heading="This link doesn't work anymore"
      sentence="It has expired, was already used or is incomplete. Open the link in the newest email we sent you."
      link={{ href: '/auth', label: 'Back to sign in', look: 'back' }}
    />
  );
}
