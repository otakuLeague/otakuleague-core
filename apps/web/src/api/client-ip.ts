import { isIP } from 'node:net';
import { headers } from 'next/headers';

declare const clientIpBrand: unique symbol;

/**
 * One IPv4 or IPv6 address: Vercel's `x-forwarded-for` (ADR 0019), or the loopback constant that
 * `readCredentialClientIp` sends off Vercel. Only this file makes one.
 */
export type ClientIp = string & { readonly [clientIpBrand]: true };

/**
 * One IPv4 or IPv6 address and nothing else. `isIP` accepts an IPv6 zone id (`%eth0`), which the
 * API refuses, so it is refused here too.
 */
function isClientIp(value: unknown): value is ClientIp {
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

declare const clientNetworkBrand: unique symbol;

/** What a client address stands for in a counter. Only `clientNetworkOf`, `clientSiteOf` and the loopback constant make one. */
export type ClientNetwork = string & { readonly [clientNetworkBrand]: true };

const IPV6_GROUPS = 8;
const IPV6_MAPPED_MARKER = 0xffff;

/** Dotted IPv4 tail of an IPv6 ("::ffff:1.2.3.4") as two hex groups; other text is unchanged. */
function withHexTail(ip: string): string {
  const tail = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (tail === null) return ip;
  const [, head = '', ...octets] = tail;
  const [a = 0, b = 0, c = 0, d = 0] = octets.map(Number);
  return `${head}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
}

/** The eight 16-bit groups of a valid IPv6 without a zone id. */
function ipv6Groups(ip: string): readonly number[] {
  const [head = '', tail] = withHexTail(ip).split('::');
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((group) => parseInt(group, 16));
  const front = parse(head);
  if (tail === undefined) return front;
  const back = parse(tail);
  return [
    ...front,
    ...new Array<number>(IPV6_GROUPS - front.length - back.length).fill(0),
    ...back,
  ];
}

/**
 * The network a client address stands for, for counting per visitor: an IPv4 as it is, an
 * IPv4-mapped IPv6 as that IPv4, any other IPv6 as its first 64 bits in one spelling
 * ("2001:db8:1:2::/64"), since one home line owns a whole /64. The same rule as the API's
 * `visitorKeyFromClientIp` (apps/api/src/common/api-caller.ts, ADR 0019 item 7), copied on
 * purpose: both specs run the same table of addresses, so change them together. Pure.
 */
export function clientNetworkOf(clientIp: ClientIp): ClientNetwork {
  if (isIP(clientIp) === 4) return clientIp as string as ClientNetwork;
  const groups = ipv6Groups(clientIp);
  if (isIpv4Mapped(groups)) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(
      '.',
    ) as ClientNetwork;
  }
  return ipv6PrefixOf(groups, 4);
}

/**
 * The /48 an IPv6 client's /64 sits in ("2001:db8:1::/48"), the second tier of the action throttle
 * (ADR 0015 Addendum OTA-207, decision 12); none for an IPv4 or an IPv4-mapped IPv6. Pure.
 */
export function clientSiteOf(clientIp: ClientIp): ClientNetwork | undefined {
  if (isIP(clientIp) === 4) return undefined;
  const groups = ipv6Groups(clientIp);
  return isIpv4Mapped(groups) ? undefined : ipv6PrefixOf(groups, 3);
}

function isIpv4Mapped(groups: readonly number[]): boolean {
  return (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === IPV6_MAPPED_MARKER
  );
}

/** The first `count` groups in one spelling, then the prefix length: "2001:db8:1:2::/64". */
function ipv6PrefixOf(groups: readonly number[], count: number): ClientNetwork {
  return `${groups
    .slice(0, count)
    .map((group) => group.toString(16))
    .join(':')}::/${count * 16}` as ClientNetwork;
}

const LOOPBACK_CLIENT_IP = '127.0.0.1' as ClientIp;

/** The one network of a single-machine web (development): the loopback constant, as a network. */
export const LOOPBACK_CLIENT_NETWORK = '127.0.0.1' as ClientNetwork;

/** The IP a credential call sends, or why it must not be sent (the caller refuses the call). */
export type CredentialClientIp =
  | { readonly kind: 'known'; readonly clientIp: ClientIp }
  | {
      readonly kind: 'refused';
      readonly reason: 'action_forwarded' | 'client_ip_unknown';
    };

/**
 * The IP a credential call (sign-in, sign-up, reset) sends, which the API rate-limits by. On Vercel:
 * Vercel's `x-forwarded-for`, else `client_ip_unknown` when it is missing or malformed (a platform
 * fault), or `action_forwarded` when `x-action-forwarded` is present: Next sets it when it re-sends a
 * Server Action between its own workers, whose `x-forwarded-for` is Vercel's egress address shared
 * by every visitor, but a visitor can send it too. Off Vercel nobody overwrites the header, so it is
 * never read: a loopback web (http, which `readWebPublicUrl` allows only there) is one machine and
 * sends 127.0.0.1; an https web off Vercel (another host, or Vercel with its system variables
 * hidden) throws rather than put every visitor in one bucket.
 */
export async function readCredentialClientIp({
  isHttps,
}: {
  readonly isHttps: boolean;
}): Promise<CredentialClientIp> {
  if (process.env.VERCEL === '1') {
    const incomingHeaders = await headers();
    if (incomingHeaders.has('x-action-forwarded')) {
      return { kind: 'refused', reason: 'action_forwarded' };
    }
    const clientIp = clientIpFromHeaders(incomingHeaders);
    return clientIp === undefined
      ? { kind: 'refused', reason: 'client_ip_unknown' }
      : { kind: 'known', clientIp };
  }
  if (isHttps) {
    throw new Error(
      'Invalid web configuration: credential calls off Vercel need an http loopback WEB_PUBLIC_URL; on Vercel keep "Automatically expose System Environment Variables" on (VERCEL=1).',
    );
  }
  return { kind: 'known', clientIp: LOOPBACK_CLIENT_IP };
}
