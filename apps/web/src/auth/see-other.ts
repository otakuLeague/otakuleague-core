import type { EmailLinkLanding } from './email-link';

/**
 * The link handler's only answer (ADR 0015 Addendum 1f-vi decision 3): a bodiless 303 (a GET
 * after it, never a 307), a relative `Location` so the browser stays on the host holding the
 * cookies, never stored, and no `Referer` on the request it starts. The policy rides a 303 with
 * no body, never a document, so no page or form inherits it (the referrer guard names this file).
 * Takes only a landing constant: no request input reaches `Location`.
 */
export function seeOther(landing: EmailLinkLanding): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: landing,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
