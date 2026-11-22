/**
 * Next's own rule for "this request may be a Server Action" (`getIsPossibleServerAction`, read in
 * Next 16.4.5 `server/lib/server-action-request-meta.js`): a POST with a `next-action` header, or
 * whose `content-type` is exactly `application/x-www-form-urlencoded` or starts with
 * `multipart/form-data`. `action-post.test.ts` runs one table through both, so an upgrade that
 * changes Next's rule fails a test instead of leaving a gap (ADR 0015 Addendum OTA-207, decision 2).
 */
export function isPossibleActionPost({
  method,
  headers,
}: Pick<Request, 'method' | 'headers'>): boolean {
  if (method !== 'POST') return false;
  const contentType = headers.get('content-type');
  return (
    headers.has('next-action') ||
    contentType === 'application/x-www-form-urlencoded' ||
    contentType?.startsWith('multipart/form-data') === true
  );
}

/** The host Next's own action check compares `Origin` with: the first `x-forwarded-host`, else `host`. */
function requestHostOf(headers: Pick<Headers, 'get'>): string | undefined {
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return forwardedHost === undefined || forwardedHost === ''
    ? (headers.get('host') ?? undefined)
    : forwardedHost;
}

/**
 * A POST another site sent (ADR 0015 Addendum OTA-207, decision 11): `Sec-Fetch-Site` present and
 * not `same-origin`, or an `Origin` that is `null`, unparseable or another host than the request's.
 * The proxy refuses it before counting, so another site cannot spend a visitor's budget. No `Origin`
 * at all is counted: a browser form always sends one, and a script sends what it likes.
 */
export function isCrossSitePost(headers: Pick<Headers, 'get'>): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return true;
  const origin = headers.get('origin');
  if (origin === null) return false;
  // `URL.parse('null')` is null, so an opaque origin is refused here too.
  const originHost = URL.parse(origin)?.host;
  return originHost === undefined || originHost !== requestHostOf(headers);
}
