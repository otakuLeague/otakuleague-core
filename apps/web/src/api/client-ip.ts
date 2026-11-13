import { isIP } from 'node:net';
import { headers } from 'next/headers';

declare const clientIpBrand: unique symbol;

/** One IPv4 or IPv6 address, read from the request's `x-forwarded-for` (ADR 0019). */
export type ClientIp = string & { readonly [clientIpBrand]: true };

/**
 * The visitor's IP as Vercel sets it: Vercel overwrites `x-forwarded-for` with the one address it
 * saw, so a list, a port or text means the request did not come through Vercel and yields nothing.
 * Never another header (`x-real-ip`, `forwarded`), which a visitor could set. `isIP` accepts an
 * IPv6 zone id (`%eth0`), which the API refuses, so it is refused here too.
 */
export function clientIpFromHeaders(
  requestHeaders: Pick<Headers, 'get'>,
): ClientIp | undefined {
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.trim();
  if (
    forwardedFor === undefined ||
    forwardedFor.includes('%') ||
    isIP(forwardedFor) === 0
  ) {
    return undefined;
  }
  return forwardedFor as ClientIp;
}

/** Request-time data: call it only behind Suspense, on a call that can start an import. */
export async function readClientIp(): Promise<ClientIp | undefined> {
  return clientIpFromHeaders(await headers());
}
