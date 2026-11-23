import type { EmailLinkLanding } from './email-link';
import type { WebPublicUrl } from './web-public-url';

// Never stored, and no `Referer` on a request the answer starts. The policy rides only bodiless
// answers, never a document, so no page or form inherits it (the referrer guard names this file).
const UNSTORED_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * The link handler's answer (ADR 0015 Addendum 1f-vi decision 3): a bodiless 303 (a GET after it,
 * never a 307), a relative `Location` so the browser stays on the host holding the cookies, and the
 * two headers above. Takes only a landing constant: no request input reaches `Location`.
 */
export function seeOther(landing: EmailLinkLanding): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: landing, ...UNSTORED_HEADERS },
  });
}

/**
 * `seeOther` for an answer from the proxy (OTA-223). Next's proxy adapter parses `Location` with
 * `new NextURL(location)` (`next/dist/server/web/adapter.js`): a relative one throws and the
 * visitor gets a 500. So the landing goes under the configured origin (`WEB_PUBLIC_URL`, already
 * parsed), never the request's; the adapter turns a same-host one back into the path.
 */
export function seeOtherFromProxy(
  webPublicUrl: WebPublicUrl,
  landing: EmailLinkLanding,
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${webPublicUrl.origin}${landing}`,
      ...UNSTORED_HEADERS,
    },
  });
}

/**
 * The answer to a speculative load of the link (a prefetch or prerender, ADR 0015 Addendum 1f-vi,
 * amended in vi-b): a bodiless 503 with the two headers above and no `Location`. Chrome serves a
 * prefetched 303 as the later click, so the handler would never see the click; a non-2xx is
 * discarded and the click becomes a real navigation.
 */
export function refuseSpeculation(): Response {
  return new Response(null, { status: 503, headers: UNSTORED_HEADERS });
}
