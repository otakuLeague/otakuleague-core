import type { NextConfig } from 'next';

type HeaderRule = Awaited<
  ReturnType<NonNullable<NextConfig['headers']>>
>[number];

/**
 * No page renders inside a frame (ADR 0015 Addendum 1f-iv-c2, F9): the header holds a sign-out
 * form on every page, so a framing site could trick a click on it. The policy holds
 * `frame-ancestors` only and restricts nothing else (a full policy is its own ticket);
 * `X-Frame-Options` repeats it for older browsers.
 */
export const FRAME_DENY_RULE: HeaderRule = {
  source: '/:path*',
  headers: [
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    { key: 'X-Frame-Options', value: 'DENY' },
  ],
};
