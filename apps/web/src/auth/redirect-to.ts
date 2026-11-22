import { redirect, RedirectType } from 'next/navigation';
import type { SafeNextPath } from './safe-next-path';

/**
 * The auth code's redirect: only a `SafeNextPath`, so a raw `next` or another origin cannot reach
 * `redirect()` by mistake. With JavaScript, the redirect replaces the history entry (a Server Action
 * pushes by default; the no-JS 303 path ignores it). It throws Next's redirect signal: call it
 * outside any try/catch.
 */
export function redirectTo(path: SafeNextPath): never {
  redirect(path, RedirectType.replace);
}

/** After sign-out: always home, a constant, replacing the history entry like `redirectTo`. */
export function redirectToSignedOut(): never {
  redirect('/', RedirectType.replace);
}

/** After an accepted sign-up: "Check your email", a constant, replacing the history entry too. */
export function redirectToCheckEmail(): never {
  redirect('/auth/check-email', RedirectType.replace);
}
