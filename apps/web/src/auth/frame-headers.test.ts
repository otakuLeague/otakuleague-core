// @vitest-environment node
import { expect, it } from 'vitest';
import { FRAME_DENY_RULE } from './frame-headers';

// Wired after the robots rules in next.config.ts: checked as text in src/api/config.test.ts.
it('denies every frame on every path, with exactly the two headers', () => {
  expect(FRAME_DENY_RULE).toEqual({
    source: '/:path*',
    headers: [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' },
    ],
  });
});
