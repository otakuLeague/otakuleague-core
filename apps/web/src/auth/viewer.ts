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
 * A `GET /me` outcome as a viewer. Only a 401 `UNAUTHORIZED` envelope (or a preview) is
 * `signed_out`: a 403, another 401, an outage or a body off contract is `unavailable`.
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
  const { failure } = result;
  return failure.kind === 'api_error' &&
    failure.status === 401 &&
    failure.error.error.code === 'UNAUTHORIZED'
    ? SIGNED_OUT
    : UNAVAILABLE;
}
