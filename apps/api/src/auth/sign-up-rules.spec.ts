import { describe, expect, it } from 'vitest';
import { PENDING_SIGN_UP_TTL_MS } from './sign-up-rules';

describe('PENDING_SIGN_UP_TTL_MS', () => {
  it('pins the ADR 0015 PENDING_SIGN_UP_TTL: 24 hours', () => {
    expect(PENDING_SIGN_UP_TTL_MS).toBe(24 * 60 * 60_000);
  });
});
