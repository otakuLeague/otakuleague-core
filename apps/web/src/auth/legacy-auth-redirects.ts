import type { NextConfig } from 'next';

type RouteRedirect = Awaited<
  ReturnType<NonNullable<NextConfig['redirects']>>
>[number];

/**
 * Auth URLs of the old otakuleague.com, sent to `/auth` with a 308 (`permanent`). The request's query
 * is passed through (`/sign-in?next=/season` keeps its `next`, the destination's `mode` winning over
 * the request's); `/sign-up` likewise answers a 308 to `/auth?mode=sign-up`, keeping the query.
 * Verified on `next start`; Vercel's edge still a beta check.
 */
export const LEGACY_AUTH_REDIRECTS: readonly RouteRedirect[] = [
  { source: '/sign-in', destination: '/auth?mode=sign-in', permanent: true },
  { source: '/sign-up', destination: '/auth?mode=sign-up', permanent: true },
];
