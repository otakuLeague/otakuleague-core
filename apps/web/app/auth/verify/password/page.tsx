import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmEmailForm } from '../../../../src/auth/confirm-email-form';
import { credentialRoutesOff } from '../../../../src/auth/credential-call';
import { FocusHeading } from '../../../../src/auth/focus-heading';
import { PreviewOffNotice } from '../../../../src/auth/sign-in-form-view';
import '../../../styles/auth.css';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-vi).
export const metadata: Metadata = { title: 'Confirm your email' };

/**
 * The emailed link opened without this browser's binding (OTA-139 1f-vi-c, ADR 0015 Addendum 1f-vi
 * decision 9): a static shell, no request-time read and no API call at render. The token waits in
 * the verify cookie; only the form's action reads it. A preview never shows the form.
 */
export default function ConfirmEmailPasswordPage() {
  if (credentialRoutesOff(process.env)) {
    return (
      <main className="au-page">
        <h1>Confirm your email</h1>
        <PreviewOffNotice
          title="Email confirmation is off on preview deployments"
          detail="Use the live site to confirm your email."
        />
      </main>
    );
  }
  return (
    <main className="au-page">
      <FocusHeading>Confirm your email</FocusHeading>
      <p className="au-sub">
        Enter the password you chose when you signed up. We ask because this
        browser isn&apos;t the one that signed up.
      </p>
      <ConfirmEmailForm />
      <p className="au-foot">
        <Link href="/auth">Back to sign in</Link>
      </p>
    </main>
  );
}
