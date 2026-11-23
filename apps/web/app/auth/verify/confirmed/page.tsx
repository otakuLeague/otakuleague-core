import type { Metadata } from 'next';
import { EmailLinkScreen } from '../email-link-screen';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: 'Your email is confirmed' };

/** The address is confirmed but nobody was signed in here (OTA-139 1f-vi-b). */
export default function ConfirmedPage() {
  return (
    <EmailLinkScreen
      tone="ok"
      heading="Your email is confirmed"
      sentence="Sign in to continue."
      link={{ href: '/auth', label: 'Sign in', look: 'primary' }}
    />
  );
}
