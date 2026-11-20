import { apiClient, type ApiPath, type ApiResult } from '../api/client';
import { isClientIp, readCredentialClientIp } from '../api/client-ip';
import { readWebPublicUrl } from './web-public-url';

// The only auth file allowed to import apiClient() (lint gate in eslint.config.mjs): every call that
// posts a password or an emailed token goes through credentialCall (ADR 0003 OTA-139 addendum).

/**
 * Previews and `vercel dev` (Vercel without `VERCEL_ENV=production`) never take credentials: they
 * hold the preview key, which the API accepts on GET and HEAD only, and a password typed there
 * would cross for nothing. An unset or empty `VERCEL_ENV` counts as off (deny by default).
 */
export function credentialRoutesOff(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.VERCEL === '1' && env.VERCEL_ENV !== 'production';
}

export type CredentialCallResult<T> =
  | { readonly kind: 'called'; readonly result: ApiResult<T> }
  | {
      readonly kind: 'refused';
      readonly reason: 'preview_deployment' | 'client_ip_unknown';
    };

export interface CredentialRequest<T> {
  readonly path: ApiPath;
  /** Sent as JSON, never logged; the auth action builds it from validated form fields. */
  readonly body: object;
  readonly isExpectedBody: (body: unknown) => body is T;
}

/**
 * One POST with the internal key and the visitor's IP, or a refusal before any request. A refusal
 * is a page state, not an error; a missing key or `WEB_PUBLIC_URL` throws (configuration), and
 * nothing is retried: each attempt counts against the visitor's limits (ADR 0020).
 */
export async function credentialCall<T>({
  path,
  body,
  isExpectedBody,
}: CredentialRequest<T>): Promise<CredentialCallResult<T>> {
  if (credentialRoutesOff(process.env)) {
    return { kind: 'refused', reason: 'preview_deployment' };
  }
  const clientIp = await readCredentialClientIp(readWebPublicUrl(process.env));
  // Checked again at runtime: a missing IP must refuse the call, never send it without one.
  if (!isClientIp(clientIp)) {
    return { kind: 'refused', reason: 'client_ip_unknown' };
  }
  const result = await apiClient().call(path, {
    method: 'POST',
    body,
    clientIp,
    requiresInternalKey: true,
    isExpectedBody,
  });
  return { kind: 'called', result };
}
