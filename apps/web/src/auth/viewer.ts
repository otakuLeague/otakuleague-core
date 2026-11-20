import { isMeResponse } from '@otakuleague/shared-types';
import type { SessionCallResult } from './session-call';

/** Who is looking at the page (ADR 0015). `unavailable`: unknown right now, shown as an empty slot. */
export type Viewer =
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'signed_in'; readonly username: string }
  | { readonly kind: 'unavailable' };

const SIGNED_OUT: Viewer = { kind: 'signed_out' };
const UNAVAILABLE: Viewer = { kind: 'unavailable' };

/**
 * A `GET /me` outcome as a viewer. Only a 401 envelope (or a preview) is `signed_out`: a 403, an
 * outage or a body off contract is `unavailable`, never read as a sign-out.
 */
export function viewerFrom(callResult: SessionCallResult<unknown>): Viewer {
  if (callResult.kind === 'refused') {
    return SIGNED_OUT;
  }
  const { result } = callResult;
  if (result.ok) {
    return isMeResponse(result.data)
      ? { kind: 'signed_in', username: result.data.username }
      : UNAVAILABLE;
  }
  return result.failure.kind === 'api_error' && result.failure.status === 401
    ? SIGNED_OUT
    : UNAVAILABLE;
}
