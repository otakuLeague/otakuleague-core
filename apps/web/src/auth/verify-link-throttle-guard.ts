import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';
import type { ClientNetwork } from '../api/client-ip';
import type {
  ActionThrottle,
  ActionThrottleConfig,
  ActionThrottleKey,
} from './action-throttle';
import {
  GUARD_PASS,
  throttleClientOf,
  type ActionClientSource,
  type ActionGuardVerdict,
} from './action-throttle-guard';
import {
  EMAIL_LINK_LANDINGS,
  emailLinkTokenFrom,
  linkRequestKindOf,
} from './email-link';
import { seeOtherFromProxy } from './see-other';
import { readWebPublicUrl, type WebPublicUrl } from './web-public-url';

/**
 * 10 opened links per IPv4 or IPv6 /64 every 15 minutes, the API's confirm limit, on this
 * instance alone (OTA-223). A counter of its own: action POSTs never spend it, nor it theirs.
 */
export const VERIFY_LINK_THROTTLE_CONFIG: ActionThrottleConfig = {
  limit: 10,
  windowMs: 15 * 60_000,
  maxEntries: 10_000,
};

export interface VerifyLinkThrottleGuardOptions {
  /** The keyer under this instance's secret, shared with the action guard. */
  readonly keyOf: (network: ClientNetwork) => ActionThrottleKey;
  /** `VERIFY_LINK_THROTTLE_CONFIG`; no IPv6 /48 tier. */
  readonly perNetwork: ActionThrottle;
  /** Read on each request it counts, never at build. */
  readonly clientSource: () => ActionClientSource;
  /** `readOptionalWebPublicUrl(process.env)`: the origin of the over-cap `Location`. */
  readonly webPublicUrl: () => WebPublicUrl | undefined;
}

/**
 * `WEB_PUBLIC_URL` as the handler reads it, or nothing when it is missing or invalid (a preview
 * included): the handler then makes 0 calls, so the guard passes uncounted.
 */
export function readOptionalWebPublicUrl(
  env: Readonly<Record<string, string | undefined>>,
): WebPublicUrl | undefined {
  try {
    return readWebPublicUrl(env);
  } catch {
    return undefined;
  }
}

/**
 * The path as Next routes it: it invokes the proxy and finds the route on the percent-decoded path
 * too (`/auth/%76erify` reaches the handler), so compare that, one trailing `/` ignored. A path
 * that cannot be decoded is not the link.
 */
function routedPathOf(rawPathname: string): string | undefined {
  try {
    const decoded = decodeURIComponent(rawPathname);
    return decoded.length > 1 && decoded.endsWith('/')
      ? decoded.slice(0, -1)
      : decoded;
  } catch {
    return undefined;
  }
}

/**
 * Exactly the requests `verifyEmailLink` sends to the API: a person opening it (`navigate`, which
 * is a GET only, checked first so an action POST parses no URL), the link's path and a well-formed
 * token. A prefetch, HEAD, image tag or bad token passes uncounted, since the handler answers it
 * with 0 calls.
 */
function wouldConfirm(request: Request): boolean {
  if (linkRequestKindOf(request) !== 'navigate') return false;
  const url = new URL(request.url);
  return (
    routedPathOf(url.pathname) === EMAIL_VERIFICATION_LINK.path &&
    emailLinkTokenFrom(url.searchParams) !== undefined
  );
}

/**
 * The proxy's throttle on `GET /auth/verify` (OTA-223). Each pass drops ended windows. A link
 * opening without a known client passes uncounted: the handler's credential call then refuses
 * with 0 calls (`client_ip_unknown`, reported there); so does one without a valid
 * `WEB_PUBLIC_URL` (the handler lands on try-again or `/auth`, 0 calls). Else it counts on its /64
 * (or IPv4); over the cap it gets the handler's try-again answer with an absolute `Location` under
 * that origin (`seeOtherFromProxy`: bodiless 303, `no-store`, no Referer, no token), so the
 * handler never runs and nothing reaches the API. No I/O, no log.
 */
export function createVerifyLinkThrottleGuard({
  keyOf,
  perNetwork,
  clientSource,
  webPublicUrl,
}: VerifyLinkThrottleGuardOptions): (request: Request) => ActionGuardVerdict {
  return (request) => {
    perNetwork.forgetEnded();
    if (!wouldConfirm(request)) return GUARD_PASS;
    const client = throttleClientOf(request.headers, clientSource());
    if (client.kind === 'unknown') return GUARD_PASS;
    const origin = webPublicUrl();
    if (origin === undefined) return GUARD_PASS;
    return perNetwork.take(keyOf(client.network)).kind === 'allowed'
      ? GUARD_PASS
      : {
          kind: 'answer',
          response: seeOtherFromProxy(origin, EMAIL_LINK_LANDINGS.tryAgain),
        };
  };
}
