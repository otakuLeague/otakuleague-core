import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { credentialRoutesOff } from '../../src/auth/credential-call';
import { SignInForm } from '../../src/auth/sign-in-form';
import {
  PreviewOffNotice,
  SIGN_IN_HEADING_ID,
} from '../../src/auth/sign-in-form-view';
import {
  AuthQueryFields,
  type AuthSearchParams,
  SignUpPanel,
} from './auth-query-fields';
import '../styles/auth.css';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to keep your anime list, XP and rank in sync.',
  alternates: { canonical: '/auth' },
};

/**
 * Sign-in and sign-up (OTA-139). The sign-in panel is the static shell (ADR 0014): no API call and
 * no headers or cookies at render. Only the two `Suspense` holes read the query: `SignUpPanel`
 * (rendered before sign-in, which CSS then hides) and `AuthQueryFields` (`next`). A preview
 * deployment never shows a form, since the actions would refuse it anyway (`credentialRoutesOff`).
 */
export default function AuthPage({
  searchParams,
}: {
  readonly searchParams: Promise<AuthSearchParams>;
}) {
  if (credentialRoutesOff(process.env)) {
    return (
      <main className="au-page">
        <h1>Welcome back</h1>
        <p className="au-sub">
          Sign in to keep your list, XP and rank in sync.
        </p>
        <PreviewOffNotice />
      </main>
    );
  }
  return (
    <main className="au-page">
      <Suspense fallback={null}>
        <SignUpPanel searchParams={searchParams} />
      </Suspense>
      <div className="au-panel" data-auth-panel="sign-in">
        {/* Focused only by the sign-up panel's FocusHeading as it goes: no island in the shell. */}
        <h1 id={SIGN_IN_HEADING_ID} tabIndex={-1}>
          Welcome back
        </h1>
        <p className="au-sub">
          Sign in to keep your list, XP and rank in sync.
        </p>
        <SignInForm>
          <Suspense fallback={null}>
            <AuthQueryFields searchParams={searchParams} />
          </Suspense>
        </SignInForm>
        <p className="au-foot">
          No account yet?{' '}
          <Link href="/auth?mode=sign-up">Create one, it&apos;s free</Link>
        </p>
      </div>
    </main>
  );
}
