/**
 * The whole body of the proxy's 429 for a throttled Server Action POST (ADR 0015 Addendum OTA-207,
 * decision 5). ASCII and sent as exactly `text/plain`, so Next's client makes it the thrown error's
 * message; it is also the whole page a submit without JavaScript gets. No import, so a client form
 * can read it.
 */
export const ACTION_THROTTLED_TEXT =
  'Too many requests from your network. Wait a minute, then go back and try again.';
