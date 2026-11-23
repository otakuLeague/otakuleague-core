import { redirect, RedirectType } from 'next/navigation';
import { EMAIL_LINK_LANDINGS } from './email-link';
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

/**
 * Where the password page's action can land (ADR 0015 Addendum 1f-vi decision 9): three of the
 * emailed link's own screens, constants. Never `signed-in`: that path gives no session.
 */
export const CONFIRM_EMAIL_LANDINGS = {
  confirmed: EMAIL_LINK_LANDINGS.confirmed,
  expired: EMAIL_LINK_LANDINGS.expired,
  tryAgain: EMAIL_LINK_LANDINGS.tryAgain,
} as const;

export type ConfirmEmailLanding =
  (typeof CONFIRM_EMAIL_LANDINGS)[keyof typeof CONFIRM_EMAIL_LANDINGS];

/** After the password page's action: one of its landings, replacing the history entry too. */
export function redirectToConfirmEmailLanding(
  landing: ConfirmEmailLanding,
): never {
  redirect(landing, RedirectType.replace);
}
