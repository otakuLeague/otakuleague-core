'use server';

import { cookies, headers } from 'next/headers';
import { clearedSessionCookie } from './auth-cookies';
import { credentialRoutesOff } from './credential-call';
import { deleteSession } from './delete-session';
import { redirectToSignedOut } from './redirect-to';
import { readSessionToken } from './session-call';
import { isSameOrigin, readWebPublicUrl } from './web-public-url';

/**
 * The sign-out form's Server Action (ADR 0015 Addendum 1f-iv-b); takes no input. A preview returns
 * before `WEB_PUBLIC_URL` is read (no session can exist there), and an `Origin` that is not exactly
 * `WEB_PUBLIC_URL`'s (missing and `null` included: logout CSRF) returns with no cookie read, no
 * call and no redirect. Otherwise a well-formed session is deleted (one call, never throws but
 * Next's signals), the cookie is always cleared with `Secure` kept (never `cookies().delete()`),
 * then home. No try/catch: a configuration error surfaces, and the redirect signal must propagate.
 */
export async function signOutAction(): Promise<void> {
  if (credentialRoutesOff(process.env)) {
    return;
  }
  const webPublicUrl = readWebPublicUrl(process.env);
  if (!isSameOrigin((await headers()).get('origin'), webPublicUrl)) {
    return;
  }
  const session = await readSessionToken(webPublicUrl);
  if (session !== undefined) {
    await deleteSession(session);
  }
  const { name, options } = clearedSessionCookie(webPublicUrl);
  (await cookies()).set(name, '', options);
  redirectToSignedOut();
}
