import type { NextConfig } from 'next';

type RouteRedirect = Awaited<
  ReturnType<NonNullable<NextConfig['redirects']>>
>[number];

/**
 * Auth URLs of the old otakuleague.com, sent to `/auth` with a 308 (`permanent`). Next passes the
 * request's query through, so `/sign-in?next=/season` keeps its `next`; the destination's own `mode`
 * wins over a `mode` the request carries.
 */
export const LEGACY_AUTH_REDIRECTS: readonly RouteRedirect[] = [
  { source: '/sign-in', destination: '/auth?mode=sign-in', permanent: true },
];
