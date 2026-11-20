// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clearedSessionCookie, sessionCookie } from './auth-cookies';
import { parseWebPublicUrl } from './web-public-url';

describe.each([
  // https: __Host- and Secure, so no subdomain or plain-http page can set or shadow it.
  ['https://beta.otakuleague.com', '__Host-ol_session', true],
  // Loopback http: browsers refuse a Secure cookie there, so no prefix and no Secure.
  ['http://localhost:3000', 'ol_session', false],
] as const)('on %s', (origin, name, secure) => {
  const webPublicUrl = parseWebPublicUrl(origin);
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };

  it('sets the session for 180 days, with no Domain', () => {
    expect(sessionCookie(webPublicUrl)).toStrictEqual({
      name,
      options: { ...options, maxAge: 15_552_000 },
    });
  });

  it('clears it with the same name and attributes and Max-Age 0', () => {
    expect(clearedSessionCookie(webPublicUrl)).toStrictEqual({
      name,
      options: { ...options, maxAge: 0 },
    });
  });
});
