import type { Metadata } from 'next';
import { Suspense } from 'react';
import { credentialRoutesOff } from '../../src/auth/credential-call';
import { SignInForm } from '../../src/auth/sign-in-form';
import { PreviewOffNotice } from '../../src/auth/sign-in-form-view';
import { AuthQueryFields, type AuthSearchParams } from './auth-query-fields';
import '../styles/auth.css';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to keep your anime list, XP and rank in sync.',
  alternates: { canonical: '/auth' },
};

/**
 * Sign-in (OTA-139). The heading and the form are the static shell (ADR 0014): no API call and no
 * headers or cookies at render; only `AuthQueryFields` reads the query. A preview deployment never
 * shows a password field, since the action would refuse it anyway (`credentialRoutesOff`).
 */
export default function AuthPage({
  searchParams,
}: {
  readonly searchParams: Promise<AuthSearchParams>;
}) {
  return (
    <main className="au-page">
      <h1>Welcome back</h1>
      <p className="au-sub">Sign in to keep your list, XP and rank in sync.</p>
      {credentialRoutesOff(process.env) ? (
        <PreviewOffNotice />
      ) : (
        <SignInForm>
          <Suspense fallback={null}>
            <AuthQueryFields searchParams={searchParams} />
          </Suspense>
        </SignInForm>
      )}
    </main>
  );
}
