import { isIP } from 'node:net';
import { headers } from 'next/headers';

declare const clientIpBrand: unique symbol;

/** One IPv4 or IPv6 address, read from the request's `x-forwarded-for` (ADR 0019). */
export type ClientIp = string & { readonly [clientIpBrand]: true };

/**
 * The visitor's IP as Vercel sets it: Vercel overwrites `x-forwarded-for` with the one address it
 * saw, so a list, a port or text means the request did not come through Vercel and yields nothing.
 * Never another header (`x-real-ip`, `forwarded`): Vercel does not guarantee to overwrite them.
 * `isIP` accepts an IPv6 zone id (`%eth0`), which the API refuses, so it is refused here too.
 */
export function clientIpFromHeaders(
  incomingHeaders: Pick<Headers, 'get'>,
): ClientIp | undefined {
  const forwardedFor = incomingHeaders.get('x-forwarded-for')?.trim();
  if (
    forwardedFor === undefined ||
    forwardedFor.includes('%') ||
    isIP(forwardedFor) === 0
  ) {
    return undefined;
  }
  return forwardedFor as ClientIp;
}

/**
 * Request-time data: call it only behind Suspense, on a call that can start an import, never inside
 * `'use cache'`. Off Vercel (`VERCEL` is not `1`) nobody overwrites `x-forwarded-for`, so a visitor
 * could choose it: nothing is sent and the API counts the shared `unknown` visitor. A CDN in front
 * of Vercel would need its own decision. `headers()` is read either way, so pages render alike.
 */
export async function readClientIp(): Promise<ClientIp | undefined> {
  const incomingHeaders = await headers();
  return process.env.VERCEL === '1'
    ? clientIpFromHeaders(incomingHeaders)
    : undefined;
}
