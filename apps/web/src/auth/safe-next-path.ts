import type { WebPublicUrl } from './web-public-url';

const MAX_NEXT_LENGTH = 2048;
const HOME = '/';

/**
 * Where to send a visitor after an auth form (ADR 0015): a path on our own origin, else `/`. An
 * origin check alone lets `/.//evil.com` through, which resolves to the path `//evil.com` that a
 * browser reads as another host; so one leading `/` is required before and after resolving. The
 * result is the parser's own pathname and query (percent-encoded, no CR or LF), never the input.
 */
export function safeNextPath(
  next: unknown,
  { origin }: WebPublicUrl,
): `/${string}` {
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
  return hasOneLeadingSlash(path) ? `/${path.slice(1)}` : HOME;
}

/** `/x`, never `//x` or `/\x`: both are another host to a browser. */
function hasOneLeadingSlash(path: string): boolean {
  return path.startsWith('/') && path[1] !== '/' && path[1] !== '\\';
}
