import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';
import type { ClientNetwork } from '../api/client-ip';
import type {
  ActionThrottle,
  ActionThrottleConfig,
  ActionThrottleKey,
} from './action-throttle';
import {
  throttleClientOf,
  type ActionClientSource,
} from './action-throttle-guard';
import {
  EMAIL_LINK_LANDINGS,
  emailLinkTokenFrom,
  linkRequestKindOf,
} from './email-link';
import { seeOther } from './see-other';

/**
 * 10 opened links per IPv4 or IPv6 /64 every 15 minutes, the API's confirm limit, on this
 * instance alone (OTA-223). A counter of its own: action POSTs never spend it, nor it theirs.
 */
export const VERIFY_LINK_THROTTLE_CONFIG: ActionThrottleConfig = {
  limit: 10,
  windowMs: 15 * 60_000,
  maxEntries: 10_000,
};

/** Let the request through to the rest of the proxy, or answer it here so nothing else runs. */
export type VerifyLinkGuardVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'answer'; readonly response: Response };

const PASS: VerifyLinkGuardVerdict = { kind: 'pass' };

export interface VerifyLinkThrottleGuardOptions {
  /** The keyer under this instance's secret, shared with the action guard. */
  readonly keyOf: (network: ClientNetwork) => ActionThrottleKey;
  /** `VERIFY_LINK_THROTTLE_CONFIG`; no IPv6 /48 tier. */
  readonly perNetwork: ActionThrottle;
  /** Read on each request it counts, never at build. */
  readonly clientSource: () => ActionClientSource;
}

/**
 * Exactly the requests `verifyEmailLink` sends to the API: the link's path, a person opening it
 * (`navigate`, which is a GET only) and a well-formed token. A prefetch, HEAD, image tag or bad
 * token passes uncounted, since the handler answers it with 0 calls.
 */
function wouldConfirm(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname === EMAIL_VERIFICATION_LINK.path &&
    linkRequestKindOf(request) === 'navigate' &&
    emailLinkTokenFrom(url.searchParams) !== undefined
  );
}

/**
 * The proxy's throttle on `GET /auth/verify` (OTA-223). Each pass drops ended windows. A link
 * opening without a known client passes uncounted: the handler's credential call then refuses
 * with 0 calls (`client_ip_unknown`, reported there). Else it counts on its /64 (or IPv4); over
 * the cap it gets the handler's own try-again answer (`seeOther`: bodiless 303, `no-store`, no
 * Referer, no token in `Location`), so the handler never runs and nothing reaches the API. No I/O,
 * no log, no try/catch.
 */
export function createVerifyLinkThrottleGuard({
  keyOf,
  perNetwork,
  clientSource,
}: VerifyLinkThrottleGuardOptions): (
  request: Request,
) => VerifyLinkGuardVerdict {
  return (request) => {
    perNetwork.forgetEnded();
    if (!wouldConfirm(request)) return PASS;
    const client = throttleClientOf(request.headers, clientSource());
    if (client.kind === 'unknown') return PASS;
    return perNetwork.take(keyOf(client.network)).kind === 'allowed'
      ? PASS
      : { kind: 'answer', response: seeOther(EMAIL_LINK_LANDINGS.tryAgain) };
  };
}
