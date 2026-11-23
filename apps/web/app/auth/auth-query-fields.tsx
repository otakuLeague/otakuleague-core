import Link from 'next/link';
import { parseAuthMode } from '../../src/auth/auth-mode';
import { FocusHeading } from '../../src/auth/focus-heading';
import { rawNextParam } from '../../src/auth/safe-next-path';
import { SIGN_IN_HEADING_ID } from '../../src/auth/sign-in-form-view';
import { SignUpForm } from '../../src/auth/sign-up-form';

export type AuthSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

type QueryProps = { readonly searchParams: Promise<AuthSearchParams> };

/**
 * The `next` field of the sign-in form, streamed inside it so the rest stays in the static shell
 * (ADR 0014). `next` goes in exactly as sent: the action alone validates it (`safeNextPath`), and
 * React escapes it as an attribute value.
 */
export async function AuthQueryFields({ searchParams }: QueryProps) {
  const next = rawNextParam((await searchParams).next);
  return next === undefined ? null : (
    <input type="hidden" name="next" value={next} />
  );
}

/**
 * The sign-up panel, only for `mode=sign-up` (ADR 0015 Addendum 1f-v3 decision 1). It is placed
 * before the shell's sign-in panel, which `auth.css` then hides (`[data-auth-panel]` sibling rule).
 * Its `h1` takes focus when it mounts and gives it back to "Welcome back" when it goes (v3b).
 */
export async function SignUpPanel({ searchParams }: QueryProps) {
  if (parseAuthMode((await searchParams).mode) !== 'sign-up') {
    return null;
  }
  return (
    <div className="au-panel" data-auth-panel="sign-up">
      <FocusHeading restoreTo={SIGN_IN_HEADING_ID}>
        Create your account
      </FocusHeading>
      <p className="au-sub">Takes a minute.</p>
      <SignUpForm />
      <p className="au-foot">
        Already a member? <Link href="/auth">Sign in</Link>
      </p>
    </div>
  );
}
