import { isIP } from 'node:net';
import { headers } from 'next/headers';
import type { WebPublicUrl } from '../auth/web-public-url';

declare const clientIpBrand: unique symbol;

/** One IPv4 or IPv6 address, read from the request's `x-forwarded-for` (ADR 0019). */
export type ClientIp = string & { readonly [clientIpBrand]: true };

/**
 * One IPv4 or IPv6 address and nothing else. `isIP` accepts an IPv6 zone id (`%eth0`), which the
 * API refuses, so it is refused here too.
 */
export function isClientIp(value: unknown): value is ClientIp {
  return typeof value === 'string' && !value.includes('%') && isIP(value) !== 0;
}

/**
 * The visitor's IP as Vercel sets it: Vercel overwrites `x-forwarded-for` with the one address it
 * saw, so a list, a port or text means the request did not come through Vercel and yields nothing.
 * Never another header (`x-real-ip`, `forwarded`): Vercel does not guarantee to overwrite them.
 */
export function clientIpFromHeaders(
  incomingHeaders: Pick<Headers, 'get'>,
): ClientIp | undefined {
  const forwardedFor = incomingHeaders.get('x-forwarded-for')?.trim();
  return isClientIp(forwardedFor) ? forwardedFor : undefined;
}

/**
 * Request-time data: call it only behind Suspense, on a call that can make the API call AniList for the visitor (an import, a cold or stale list page), never inside
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

const LOOPBACK_CLIENT_IP = '127.0.0.1' as ClientIp;

/**
 * The IP a credential call (sign-in, sign-up, reset) sends, which the API rate-limits by. On Vercel,
 * Vercel's `x-forwarded-for` or nothing. Off Vercel nobody overwrites that header, so it is never
 * read: a loopback web (http, which `readWebPublicUrl` allows only there) is one machine and sends
 * 127.0.0.1; an https web off Vercel (another host, or Vercel with its system variables hidden)
 * cannot know the visitor and gives nothing, so the call is refused rather than share one bucket.
 */
export async function readCredentialClientIp({
  isHttps,
}: WebPublicUrl): Promise<ClientIp | undefined> {
  if (process.env.VERCEL === '1') {
    return clientIpFromHeaders(await headers());
  }
  return isHttps ? undefined : LOOPBACK_CLIENT_IP;
}
