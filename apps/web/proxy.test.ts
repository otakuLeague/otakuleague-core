// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from './proxy';

vi.mock('./src/auth/auth-reports', () => ({ reportClientIpUnknown: vi.fn() }));

const VISITOR_POST = {
  'next-action': 'f00dfeed',
  'x-forwarded-for': '203.0.113.7',
  host: 'otakuleague.com',
  origin: 'https://otakuleague.com',
  'sec-fetch-site': 'same-origin',
};

/** A fresh module, so this instance's counters and secret start anew. */
async function freshProxy() {
  vi.resetModules();
  vi.stubEnv('VERCEL', '1');
  const { proxy } = await import('./proxy');
  return (path: string) =>
    proxy(
      new NextRequest(`https://otakuleague.com${path}`, {
        method: 'POST',
        headers: VISITOR_POST,
      }),
    );
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
  ])('%s: invoked %o', (_label, url, headers, invoked) => {
    expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(
      invoked,
    );
  });
});

describe('proxy with the action throttle', () => {
  it('covers an action added later on a new path with no line of its own', async () => {
    const postTo = await freshProxy();
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
    const postTo = await freshProxy();
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
