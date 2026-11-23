import type { Metadata } from 'next';
import { EmailLinkScreen } from '../email-link-screen';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: 'Email confirmed' };

/** The link confirmed the address and signed this browser in (OTA-139 1f-vi-b). */
export default function SignedInPage() {
  return (
    <EmailLinkScreen
      tone="ok"
      heading="Email confirmed"
      sentence="You're signed in. Welcome to the league."
      link={{ href: '/', label: 'Continue', look: 'primary' }}
    />
  );
}
