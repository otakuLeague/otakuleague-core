import { redirect } from 'next/navigation';
import type { SafeNextPath } from './safe-next-path';

/**
 * The auth code's redirect: only a `SafeNextPath`, so a raw `next` or another origin cannot reach
 * `redirect()` by mistake. It throws Next's redirect signal: call it outside any try/catch.
 */
export function redirectTo(path: SafeNextPath): never {
  redirect(path);
}
