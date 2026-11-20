// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sessionCookie } from './auth-cookies';
import { parseWebPublicUrl } from './web-public-url';

describe('sessionCookie', () => {
  it('is __Host- and Secure on https, with no Domain', () => {
    expect(
      sessionCookie(parseWebPublicUrl('https://beta.otakuleague.com')),
    ).toStrictEqual({
      name: '__Host-ol_session',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 15_552_000,
      },
    });
  });

  it('drops the prefix and Secure on loopback http, which browsers would refuse', () => {
    expect(
      sessionCookie(parseWebPublicUrl('http://localhost:3000')),
    ).toStrictEqual({
      name: 'ol_session',
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 15_552_000,
      },
    });
  });
});
