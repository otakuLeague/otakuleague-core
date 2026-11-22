// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  flashCookie,
  sessionCookie,
  signUpCookie,
} from './auth-cookies';
import { parseWebPublicUrl } from './web-public-url';

describe.each([
  // https: __Host- and Secure, so no subdomain or plain-http page can set or shadow it.
  ['https://beta.otakuleague.com', '__Host-', true],
  // Loopback http: browsers refuse a Secure cookie there, so no prefix and no Secure.
  ['http://localhost:3000', '', false],
  ['http://127.0.0.1:3000', '', false],
] as const)('on %s', (origin, prefix, secure) => {
  const webPublicUrl = parseWebPublicUrl(origin);
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };

  it('sets the session for 180 days, with no Domain', () => {
    expect(sessionCookie(webPublicUrl)).toStrictEqual({
      name: `${prefix}ol_session`,
      options: { ...options, maxAge: 15_552_000 },
    });
  });

  it('clears it with the same name and attributes and Max-Age 0', () => {
    expect(clearedSessionCookie(webPublicUrl)).toStrictEqual({
      name: `${prefix}ol_session`,
      options: { ...options, maxAge: 0 },
    });
  });

  it('sets the sign-up binding for 24 hours, the pending sign-up TTL', () => {
    expect(signUpCookie(webPublicUrl)).toStrictEqual({
      name: `${prefix}ol_signup`,
      options: { ...options, maxAge: 86_400 },
    });
  });

  it('sets the flash address for 10 minutes', () => {
    expect(flashCookie(webPublicUrl)).toStrictEqual({
      name: `${prefix}ol_flash`,
      options: { ...options, maxAge: 600 },
    });
  });
});
