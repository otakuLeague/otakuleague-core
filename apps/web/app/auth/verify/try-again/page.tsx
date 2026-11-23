import type { Metadata } from 'next';
import { EmailLinkScreen } from '../email-link-screen';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: "We couldn't confirm your email" };

/**
 * The link may still work: a refusal, a limit, an outage or a prefetch (OTA-139 1f-vi-b). The
 * sentence names no cause, since it reads the same for all of them.
 */
export default function TryAgainPage() {
  return (
    <EmailLinkScreen
      tone="wait"
      heading="We couldn't confirm your email"
      sentence="Your link may still work. Open it again in a few minutes."
      link={{ href: '/auth', label: 'Back to sign in', look: 'back' }}
    />
  );
}
