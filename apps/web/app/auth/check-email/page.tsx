import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CheckEmailAddress, CheckEmailLede } from './check-email-lede';
import '../../styles/auth.css';

// A title only: no canonical, and the noindex comes from robotsHeaders (ADR 0015 Addendum 1f-v2).
export const metadata: Metadata = { title: 'Check your email' };

/**
 * "Check your email" (OTA-139 1f-v2a). Static shell with no API call and no cookie write: only
 * `CheckEmailAddress` reads the flash cookie, and its fallback is the whole screen without an
 * address, so the prerendered HTML never holds one. No Resend until 1f-vii.
 */
export default function CheckEmailPage() {
  return (
    <main className="au-page">
      <div className="au-badge" aria-hidden="true">
        ✉
      </div>
      <h1 tabIndex={-1}>Check your email</h1>
      <Suspense fallback={<CheckEmailLede email={undefined} />}>
        <CheckEmailAddress />
      </Suspense>
      <p className="au-hint">
        Not there after a few minutes? Check spam and promotions.
      </p>
      <p className="au-foot">
        <Link href="/auth">Back to sign in</Link>
      </p>
    </main>
  );
}
