import type { WebPublicUrl } from './web-public-url';

declare const safeNextPathBrand: unique symbol;

/** A path on our own origin; only `safeNextPath` makes one, and `redirectTo` takes nothing else. */
export type SafeNextPath = `/${string}` & {
  readonly [safeNextPathBrand]: true;
};

const MAX_NEXT_LENGTH = 2048;
const HOME = '/' as SafeNextPath;

/**
 * Where to send a visitor after an auth form (ADR 0015): a path on our own origin, else `/`. An
 * origin check alone lets `/.//evil.com` through, which resolves to the path `//evil.com` that a
 * browser reads as another host; so one leading `/` is required before and after resolving. The
 * result is the parser's own pathname and query (percent-encoded, no CR or LF), never the input.
 */
export function safeNextPath(
  next: unknown,
  { origin }: WebPublicUrl,
): SafeNextPath {
  if (
    typeof next !== 'string' ||
    next.length === 0 ||
    next.length > MAX_NEXT_LENGTH ||
    !hasOneLeadingSlash(next)
  ) {
    return HOME;
  }
  const url = URL.parse(next, origin);
  if (url?.origin !== origin) {
    return HOME;
  }
  const path = `${url.pathname}${url.search}`;
  // Percent-encoding can grow the path up to 9 times, past what a Location header should carry.
  return hasOneLeadingSlash(path) && path.length <= MAX_NEXT_LENGTH
    ? (`/${path.slice(1)}` as SafeNextPath)
    : HOME;
}

/**
 * The `?next=` query value as the visitor sent it, for the form's hidden field: one string of
 * 1 to 2048 characters, else nothing. Not validated here: only `safeNextPath`, in the action, does.
 */
export function rawNextParam(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_NEXT_LENGTH
    ? value
    : undefined;
}

/** `/x`, never `//x` or `/\x`: both are another host to a browser. */
function hasOneLeadingSlash(path: string): boolean {
  return path.startsWith('/') && path[1] !== '/' && path[1] !== '\\';
}
