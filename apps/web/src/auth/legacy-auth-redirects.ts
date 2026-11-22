import type { NextConfig } from 'next';

type RouteRedirect = Awaited<
  ReturnType<NonNullable<NextConfig['redirects']>>
>[number];

/**
 * Auth URLs of the old otakuleague.com, sent to `/auth` with a 308 (`permanent`). Next's docs say
 * the request's query is passed through (`/sign-in?next=/season` keeps its `next`, the destination's
 * `mode` winning over the request's); not verified here: a beta check before deploy.
 */
export const LEGACY_AUTH_REDIRECTS: readonly RouteRedirect[] = [
  { source: '/sign-in', destination: '/auth?mode=sign-in', permanent: true },
  { source: '/sign-up', destination: '/auth?mode=sign-up', permanent: true },
];
