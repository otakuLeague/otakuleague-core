import { isIPv4, isIPv6 } from 'node:net';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Lower case: Node lower-cases incoming header names. Sent as X-Client-Ip (ADR 0015, 0017). */
export const CLIENT_IP_HEADER = 'x-client-ip';

/** The one bucket shared by web calls without a usable client IP (ADR 0019 item 7). */
export const UNKNOWN_VISITOR_KEY = 'unknown';

/** The longest valid IPv6 text without a zone id ("ffff:...:255.255.255.255"). */
const MAX_CLIENT_IP_LENGTH = 45;

declare const visitorKeyBrand: unique symbol;

/**
 * What one visitor's imports are counted under: an IPv4, an IPv6 /64 prefix, `unknown`, or
 * `preview` (every preview deployment). Branded: only visitorKeyFromClientIp and
 * PREVIEW_VISITOR_KEY make one, so no raw header reaches a bucket.
 */
export type VisitorKey = string & { readonly [visitorKeyBrand]: true };

function asVisitorKey(value: string): VisitorKey {
  return value as VisitorKey;
}

/** The one bucket every Vercel preview shares (ADR 0019). Never an IP, so no visitor gets it. */
export const PREVIEW_VISITOR_KEY = asVisitorKey('preview');

/**
 * Who the guard decided is calling (ADR 0019 item 7). Never read from a body. `preview` is a
 * preview deployment's key: no X-Client-Ip trusted. A credential route (OTA-139) must allowlist
 * `web` only, so `open` and `preview` callers are refused there.
 */
export type ApiCaller =
  | { readonly kind: 'open' }
  | { readonly kind: 'web'; readonly visitorKey: VisitorKey }
  | { readonly kind: 'preview' };

export const OPEN_CALLER: ApiCaller = { kind: 'open' };

export const PREVIEW_CALLER: ApiCaller = { kind: 'preview' };

/** The per-visitor bucket this caller's imports use; null when nobody can be told apart. */
export function visitorKeyOf(caller: ApiCaller): VisitorKey | null {
  switch (caller.kind) {
    case 'open':
      return null;
    case 'web':
      return caller.visitorKey;
    case 'preview':
      return PREVIEW_VISITOR_KEY;
    default: {
      const unreachable: never = caller;
      return unreachable;
    }
  }
}

/** The 8 groups of a valid IPv6 without a zone id (checked by the caller). */
function ipv6Groups(address: string): number[] {
  const lastColon = address.lastIndexOf(':');
  const last = address.slice(lastColon + 1);
  // An embedded IPv4 tail ("::ffff:1.2.3.4") becomes its two 16-bit groups.
  const text = last.includes('.')
    ? `${address.slice(0, lastColon + 1)}${ipv4Groups(last).join(':')}`
    : address;
  const [head = '', tail] = text.split('::');
  const parse = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((group) => parseInt(group, 16));
  const before = parse(head);
  if (tail === undefined) return before;
  const after = parse(tail);
  return [
    ...before,
    ...Array.from({ length: 8 - before.length - after.length }, () => 0),
    ...after,
  ];
}

function ipv4Groups(dotted: string): string[] {
  const [a = 0, b = 0, c = 0, d = 0] = dotted.split('.').map(Number);
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
}

function isIpv4Mapped(groups: readonly number[]): boolean {
  return (
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  );
}

function ipv4FromGroups(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/**
 * The visitor key for an `X-Client-Ip` value, which the guard trusts only from a caller with the
 * internal key (ADR 0019 item 7). A valid IPv4 is the key as it is; an IPv4-mapped IPv6 (dotted
 * or hex) is that IPv4; any other IPv6 is cut to its first 64 bits, one spelling per prefix (one
 * home line owns a whole /64). Anything else, a missing header, a list, a zone id, brackets, a
 * port, padding or text, is the shared key `unknown`, so a call site that forgets the header
 * shows up as early 429s instead of having no limit. Pure: no I/O, never logs the value.
 */
export function visitorKeyFromClientIp(header: unknown): VisitorKey {
  if (typeof header !== 'string' || header.length > MAX_CLIENT_IP_LENGTH) {
    return asVisitorKey(UNKNOWN_VISITOR_KEY);
  }
  if (isIPv4(header)) return asVisitorKey(header);
  // isIPv6 accepts a zone id ("fe80::1%eth0"): one host could then mint endless keys.
  if (header.includes('%') || !isIPv6(header)) {
    return asVisitorKey(UNKNOWN_VISITOR_KEY);
  }
  const groups = ipv6Groups(header);
  if (isIpv4Mapped(groups)) {
    return asVisitorKey(ipv4FromGroups(groups[6] ?? 0, groups[7] ?? 0));
  }
  const prefix = groups.slice(0, 4).map((group) => group.toString(16));
  return asVisitorKey(`${prefix.join(':')}::/64`);
}

/** Request -> caller, written only by InternalKeyGuard: no header or body can write here. */
const callers = new WeakMap<object, ApiCaller>();

export function recordCaller(request: object, caller: ApiCaller): void {
  callers.set(request, caller);
}

/**
 * The caller the guard recorded for this request. Throws (a 500, never an open caller) when
 * none was: a handler on a @PublicRoute() or one reached without the guard is a bug, not a visitor.
 */
export function callerOf(request: object): ApiCaller {
  const caller = callers.get(request);
  if (caller === undefined) {
    throw new Error('No ApiCaller recorded for this request');
  }
  return caller;
}

/** Handler parameter: the ApiCaller InternalKeyGuard recorded for this request. */
export const Caller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiCaller =>
    callerOf(context.switchToHttp().getRequest<object>()),
);
