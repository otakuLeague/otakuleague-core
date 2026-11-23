import { NextResponse } from 'next/server';
import {
  clientIpFromHeaders,
  clientNetworkOf,
  clientSiteOf,
  LOOPBACK_CLIENT_NETWORK,
  type ClientNetwork,
} from '../api/client-ip';
import { isCrossSitePost, isPossibleActionPost } from './action-post';
import {
  DEFAULT_ACTION_THROTTLE_CONFIG,
  type ActionThrottle,
  type ActionThrottleConfig,
  type ActionThrottleDecision,
  type ActionThrottleKey,
} from './action-throttle';
import { ACTION_THROTTLED_TEXT } from './action-throttle-text';
import { parseWebPublicUrl } from './web-public-url';

/** Each IPv6 /48 also gets 300 POSTs a window, five /64s spending their whole cap (decision 12). */
export const ACTION_SITE_THROTTLE_CONFIG: ActionThrottleConfig = {
  ...DEFAULT_ACTION_THROTTLE_CONFIG,
  limit: 300,
};

export const ACTION_CROSS_SITE_TEXT = 'Cross-site request refused.';

/**
 * Where a client address comes from (ADR 0015 Addendum OTA-207, decisions 3 and 13): Vercel's
 * `x-forwarded-for`; the loopback constant on one machine (`VERCEL` not `1` and an http loopback
 * `WEB_PUBLIC_URL`, the test of `readCredentialClientIp`); nothing elsewhere, where nobody
 * overwrites the header.
 */
export type ActionClientSource = 'vercel' | 'one_machine' | 'other_host';

export function actionClientSourceOf(
  env: Readonly<Record<string, string | undefined>>,
): ActionClientSource {
  if (env.VERCEL === '1') return 'vercel';
  try {
    // parseWebPublicUrl allows http only for a loopback host.
    return parseWebPublicUrl(env.WEB_PUBLIC_URL).isHttps
      ? 'other_host'
      : 'one_machine';
  } catch {
    // A missing or invalid value proves nothing; the auth code reports it on first use.
    return 'other_host';
  }
}

export type ThrottleClient =
  | {
      readonly kind: 'known';
      readonly network: ClientNetwork;
      readonly site: ClientNetwork | undefined;
    }
  | { readonly kind: 'unknown' };

/** The client both proxy throttles count (actions and the email link), read the same way. */
export function throttleClientOf(
  headers: Pick<Headers, 'get'>,
  source: ActionClientSource,
): ThrottleClient {
  if (source === 'one_machine') {
    return { kind: 'known', network: LOOPBACK_CLIENT_NETWORK, site: undefined };
  }
  const clientIp =
    source === 'vercel' ? clientIpFromHeaders(headers) : undefined;
  return clientIp === undefined
    ? { kind: 'unknown' }
    : {
        kind: 'known',
        network: clientNetworkOf(clientIp),
        site: clientSiteOf(clientIp),
      };
}

/**
 * Let the request through to the rest of the proxy, or answer it here so nothing else runs. Shared
 * with the email link guard.
 */
export type ActionGuardVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'answer'; readonly response: Response };

export const GUARD_PASS: ActionGuardVerdict = { kind: 'pass' };

function plainText(
  status: 403 | 429,
  body: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): ActionGuardVerdict {
  const headers = {
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  };
  return {
    kind: 'answer',
    response: new NextResponse(body, { status, headers }),
  };
}

export interface ActionThrottleGuardOptions {
  /** The keyer under this instance's secret: a key is the only form a client takes here. */
  readonly keyOf: (network: ClientNetwork) => ActionThrottleKey;
  /** 60 per IPv4 or IPv6 /64 (`DEFAULT_ACTION_THROTTLE_CONFIG`). */
  readonly perNetwork: ActionThrottle;
  /** 300 per IPv6 /48 (`ACTION_SITE_THROTTLE_CONFIG`). */
  readonly perSite: ActionThrottle;
  /** Read on each POST it counts, never at build. */
  readonly clientSource: () => ActionClientSource;
  /** Tags only, never an address; the reporter throttles itself. */
  readonly reportClientIpUnknown: () => void;
}

/**
 * The proxy's Server Action throttle (ADR 0015 Addendum OTA-207). Each pass drops ended windows.
 * A possible action POST from another site gets 403, uncounted; one without a known client passes
 * uncounted and is reported; else it counts on its /64 (or IPv4) and its IPv6 /48 together, or on
 * neither, and over either cap it gets 429 with `Retry-After`, so Next never dispatches the action. No I/O,
 * no log, no try/catch: a bug surfaces as a 500, not as a throttle that quietly stopped.
 */
export function createActionThrottleGuard({
  keyOf,
  perNetwork,
  perSite,
  clientSource,
  reportClientIpUnknown,
}: ActionThrottleGuardOptions): (
  request: Pick<Request, 'method' | 'headers'>,
) => ActionGuardVerdict {
  // A full /48 refuses before its /64 counts, and a refused /64 never counts on its /48: a POST
  // either counts on both tiers or on neither (decision 4), so rotating /64s spend nothing.
  function take(
    network: ClientNetwork,
    site: ClientNetwork | undefined,
  ): ActionThrottleDecision {
    const siteKey = site === undefined ? undefined : keyOf(site);
    const siteFull = siteKey === undefined ? undefined : perSite.peek(siteKey);
    if (siteFull?.kind === 'limited') return siteFull;
    const decision = perNetwork.take(keyOf(network));
    return decision.kind === 'allowed' && siteKey !== undefined
      ? perSite.take(siteKey)
      : decision;
  }

  return (request) => {
    perNetwork.forgetEnded();
    perSite.forgetEnded();
    if (!isPossibleActionPost(request)) return GUARD_PASS;
    if (isCrossSitePost(request.headers)) {
      return plainText(403, ACTION_CROSS_SITE_TEXT);
    }
    const client = throttleClientOf(request.headers, clientSource());
    if (client.kind === 'unknown') {
      reportClientIpUnknown();
      return GUARD_PASS;
    }
    const decision = take(client.network, client.site);
    return decision.kind === 'allowed'
      ? GUARD_PASS
      : plainText(429, ACTION_THROTTLED_TEXT, {
          'Retry-After': String(decision.retryAfterSeconds),
        });
  };
}
