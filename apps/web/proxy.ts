import { randomBytes } from 'node:crypto';
import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import type { NextRequest, ProxyConfig } from 'next/server';
import { apiClient } from './src/api/client';
import { createSlugProxy } from './src/anime/slug-proxy';
import {
  ACTION_THROTTLE_MIN_SECRET_BYTES,
  createActionThrottle,
  createActionThrottleKeyer,
  DEFAULT_ACTION_THROTTLE_CONFIG,
} from './src/auth/action-throttle';
import {
  ACTION_SITE_THROTTLE_CONFIG,
  actionClientSourceOf,
  createActionThrottleGuard,
} from './src/auth/action-throttle-guard';
import { reportClientIpUnknown } from './src/auth/auth-reports';
import {
  createVerifyLinkThrottleGuard,
  VERIFY_LINK_THROTTLE_CONFIG,
} from './src/auth/verify-link-throttle-guard';

/** Never hold an anime page longer than this: past it the page answers on its own. */
const RESOLVE_TIMEOUT_MS = 300;

const slugProxy = createSlugProxy({
  resolve: (slug) =>
    apiClient().call<AnimeSlugResolution>(
      `/anime/slugs/${encodeURIComponent(slug)}/resolve`,
      { timeoutMs: RESOLVE_TIMEOUT_MS },
    ),
});

// Counts live in this instance's memory, keyed under random bytes drawn once per instance and held
// only by the keyer: no shared secret, no variable (ADR 0015 Addendum OTA-207, decision 3). Both
// guards share the keyer; each keeps its own counters.
const keyOf = createActionThrottleKeyer(
  randomBytes(ACTION_THROTTLE_MIN_SECRET_BYTES),
);

const guardActionPost = createActionThrottleGuard({
  keyOf,
  perNetwork: createActionThrottle(DEFAULT_ACTION_THROTTLE_CONFIG, Date.now),
  perSite: createActionThrottle(ACTION_SITE_THROTTLE_CONFIG, Date.now),
  clientSource: () => actionClientSourceOf(process.env),
  reportClientIpUnknown: () => reportClientIpUnknown('action-throttle'),
});

const guardVerifyLink = createVerifyLinkThrottleGuard({
  keyOf,
  perNetwork: createActionThrottle(VERIFY_LINK_THROTTLE_CONFIG, Date.now),
  clientSource: () => actionClientSourceOf(process.env),
});

/**
 * The action throttle first (its 403 or 429 runs nothing else), then the email link throttle (its
 * 303 to try-again runs nothing else), then the anime slug door.
 */
export async function proxy(request: NextRequest) {
  const actionVerdict = guardActionPost(request);
  if (actionVerdict.kind === 'answer') return actionVerdict.response;
  const linkVerdict = guardVerifyLink(request);
  return linkVerdict.kind === 'answer'
    ? linkVerdict.response
    : slugProxy(request);
}

// Literals only: Next reads them at build. The two `/:path*` entries invoke the proxy for every
// possible Server Action POST on any path, so a new action is covered with no line of its own.
// `/auth/verify` is `EMAIL_VERIFICATION_LINK.path` (a test pins it), for the link throttle; its
// landings under `/auth/verify/` stay out.
// The proxy now buffers the body of every request with a content-type (up to
// `proxyClientMaxBodySize`, 10 MB by default): decide that limit before an upload route ships.
export const config = {
  matcher: [
    '/anime/:path*',
    '/auth/verify',
    { source: '/:path*', has: [{ type: 'header', key: 'next-action' }] },
    { source: '/:path*', has: [{ type: 'header', key: 'content-type' }] },
  ],
} satisfies ProxyConfig;
