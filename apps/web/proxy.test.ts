// @vitest-environment node
import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from './proxy';
import { EMAIL_LINK_LANDINGS } from './src/auth/email-link';

vi.mock('./src/auth/auth-reports', () => ({ reportClientIpUnknown: vi.fn() }));

const VISITOR_POST = {
  'next-action': 'f00dfeed',
  'x-forwarded-for': '203.0.113.7',
  host: 'otakuleague.com',
  origin: 'https://otakuleague.com',
  'sec-fetch-site': 'same-origin',
};

const TOKEN = 'Vk3'.padEnd(43, 'q');
const LINK = `${EMAIL_VERIFICATION_LINK.path}?${EMAIL_VERIFICATION_LINK.tokenParam}=${TOKEN}`;
const VISITOR_CLICK = {
  'x-forwarded-for': '203.0.113.7',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'none',
};

/** A fresh module, so this instance's counters and secret start anew. */
async function freshProxy() {
  vi.resetModules();
  vi.stubEnv('VERCEL', '1');
  const { proxy } = await import('./proxy');
  return {
    postTo: (path: string) =>
      proxy(
        new NextRequest(`https://otakuleague.com${path}`, {
          method: 'POST',
          headers: VISITOR_POST,
        }),
      ),
    openLink: () =>
      proxy(
        new NextRequest(`https://otakuleague.com${LINK}`, {
          headers: VISITOR_CLICK,
        }),
      ),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('proxy matcher (N26)', () => {
  it.each<[string, string, Record<string, string>, boolean]>([
    ['an anime page', '/anime/naruto/cast', {}, true],
    ['an action fetch on the home page', '/', { 'next-action': 'a1' }, true],
    [
      'a no-JS form on any page',
      '/auth',
      { 'content-type': 'multipart/form-data; boundary=x' },
      true,
    ],
    ['a plain GET elsewhere', '/season', {}, false],
    // Benign gap: with no content-type an empty id is not form data, and Next finds no action
    // for it (`getActionModIdOrError` throws "Missing 'next-action' header"), so nothing runs.
    ['an empty action id alone', '/', { 'next-action': '' }, false],
    ['the mailed link (OTA-223)', LINK, {}, true],
    ['the link with no query', EMAIL_VERIFICATION_LINK.path, {}, true],
    ['the expired landing', EMAIL_LINK_LANDINGS.expired, {}, false],
    ['the try-again landing', EMAIL_LINK_LANDINGS.tryAgain, {}, false],
    ['the password page', EMAIL_LINK_LANDINGS.password, {}, false],
    ['a look-alike path', '/auth/verified', {}, false],
    ['the sign-in page', '/auth', {}, false],
  ])('%s: invoked %o', (_label, url, headers, invoked) => {
    expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(
      invoked,
    );
  });

  it('names the mailed link by its one definition', () => {
    expect(config.matcher).toContain(EMAIL_VERIFICATION_LINK.path);
  });
});

describe('proxy with the email link throttle (OTA-223)', () => {
  it('sends the 11th opening to try-again itself: bodiless, unstored, 0 API calls, nothing passed on', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network in unit tests'));
    const { openLink } = await freshProxy();
    for (let opening = 1; opening <= 10; opening += 1) {
      expect((await openLink()).headers.get('x-middleware-next')).toBe('1');
    }

    const refused = await openLink();
    expect(refused.status).toBe(303);
    expect(refused.headers.get('location')).toBe('/auth/verify/try-again');
    expect(refused.headers.get('location')).not.toContain(TOKEN);
    expect(await refused.text()).toBe('');
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(refused.headers.get('referrer-policy')).toBe('no-referrer');
    expect(refused.headers.get('set-cookie')).toBeNull();
    expect(refused.headers.get('x-middleware-next')).toBeNull();
    expect(refused.headers.get('x-middleware-rewrite')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps all 10 openings after 60 action POSTs from the same network', async () => {
    const { postTo, openLink } = await freshProxy();
    for (let post = 1; post <= 60; post += 1) await postTo('/');
    expect((await postTo('/')).status).toBe(429);

    for (let opening = 1; opening <= 10; opening += 1) {
      expect((await openLink()).status).not.toBe(303);
    }
    expect((await openLink()).status).toBe(303);
  });

  it('keeps all 60 action POSTs after 10 openings from the same network', async () => {
    const { postTo, openLink } = await freshProxy();
    for (let opening = 1; opening <= 10; opening += 1) await openLink();
    expect((await openLink()).status).toBe(303);

    for (let post = 1; post <= 60; post += 1) {
      expect((await postTo('/')).status).not.toBe(429);
    }
    expect((await postTo('/')).status).toBe(429);
  });
});

describe('proxy with the action throttle', () => {
  it('covers an action added later on a new path with no line of its own', async () => {
    const { postTo } = await freshProxy();
    const path = '/some/new/page';

    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: path,
        headers: VISITOR_POST,
      }),
    ).toBe(true);
    for (let post = 1; post <= 60; post += 1) {
      expect((await postTo(path)).status).not.toBe(429);
    }
    expect((await postTo(path)).status).toBe(429);
  });

  it('answers a throttled POST itself: 0 API calls, 0 cookies, nothing passed on (N24)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network in unit tests'));
    const { postTo } = await freshProxy();
    for (let post = 1; post <= 60; post += 1) {
      expect((await postTo('/')).headers.get('x-middleware-next')).toBe('1');
    }

    // An anime path: had the POST gone on, the slug door would have called the API.
    const throttled = await postTo('/anime/naruto');
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('x-middleware-next')).toBeNull();
    expect(throttled.headers.get('x-middleware-rewrite')).toBeNull();
    expect(throttled.headers.get('set-cookie')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
