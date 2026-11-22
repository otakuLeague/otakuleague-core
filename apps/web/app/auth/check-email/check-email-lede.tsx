import { SIGN_UP_COOKIE_MAX_AGE_SECONDS } from '../../../src/auth/auth-cookies';
import { readFlashEmail } from '../../../src/auth/flash-email';

/** The confirmation link lives as long as the pending sign-up (ADR 0015 Addendum 1f-v). */
const LINK_HOURS = SIGN_UP_COOKIE_MAX_AGE_SECONDS / 3600;

/**
 * The one sentence of /auth/check-email (ADR 0015 Addendum 1f-v2, decision 2). Without an address it
 * claims nothing about who is reading, since it is also the static shell and the no-JS screen. The
 * address is React text in one `strong`, never an attribute.
 */
export function CheckEmailLede({
  email,
}: {
  readonly email: string | undefined;
}) {
  return email === undefined ? (
    <p className="au-sub">
      Open the confirmation link we sent to the address you signed up with. It
      works for {LINK_HOURS} hours.
    </p>
  ) : (
    <p className="au-sub">
      We sent a confirmation link to{' '}
      <strong className="au-email">{email}</strong>. Open it to finish signing
      up. It works for {LINK_HOURS} hours.
    </p>
  );
}

/** The only request-time read of the page, streamed inside its `Suspense`. */
export async function CheckEmailAddress() {
  return <CheckEmailLede email={await readFlashEmail()} />;
}
