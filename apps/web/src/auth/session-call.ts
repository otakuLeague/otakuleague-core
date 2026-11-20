import { cookies } from 'next/headers';
import { apiClient, type ApiPath, type ApiResult } from '../api/client';
import { sessionTokenFrom, type SessionToken } from '../api/session-token';
import { sessionCookie } from './auth-cookies';
import { credentialRoutesOff } from './credential-call';
import type { WebPublicUrl } from './web-public-url';

// The second and last auth file allowed to import apiClient() (lint gate in eslint.config.mjs):
// every call that carries a member's session goes through sessionCall (ADR 0015 Addendum 1f-iv).
// Never inside 'use cache': the answer belongs to one member.

export type SessionCallResult<T> =
  | { readonly kind: 'called'; readonly result: ApiResult<T> }
  | { readonly kind: 'refused'; readonly reason: 'preview_deployment' };

export interface SessionRequest<T> {
  /** Only from `readSessionToken()`: a raw string never becomes a Bearer. */
  readonly session: SessionToken;
  readonly path: ApiPath;
  readonly method?: 'GET' | 'POST';
  readonly isExpectedBody?: (body: unknown) => body is T;
  readonly timeoutMs?: number;
}

/**
 * One uncached call with the key and `Authorization: Bearer`, never `X-Client-Ip` nor a body, or a
 * refusal before any request on a preview (preview code never sends a Bearer). Never retried. A
 * missing key throws (configuration), never a call without the session.
 */
export async function sessionCall<T>({
  session,
  path,
  method = 'GET',
  isExpectedBody,
  timeoutMs,
}: SessionRequest<T>): Promise<SessionCallResult<T>> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'refused', reason: 'preview_deployment' };
  }
  const result = await apiClient().call(path, {
    method,
    session,
    cache: 'no-store',
    isExpectedBody,
    timeoutMs,
  });
  return { kind: 'called', result };
}

/**
 * The only reader of the session cookie: the name `WEB_PUBLIC_URL` gives (`__Host-` on https, so a
 * plain `ol_session` another page set is ignored), and only a well-formed token, else nothing.
 */
export async function readSessionToken(
  webPublicUrl: WebPublicUrl,
): Promise<SessionToken | undefined> {
  const { name } = sessionCookie(webPublicUrl);
  return sessionTokenFrom((await cookies()).get(name)?.value);
}
