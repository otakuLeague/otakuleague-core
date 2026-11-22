// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createActionThrottle,
  createActionThrottleKeyer,
  DEFAULT_ACTION_THROTTLE_CONFIG,
} from './action-throttle';
import {
  ACTION_CROSS_SITE_TEXT,
  ACTION_SITE_THROTTLE_CONFIG,
  actionClientSourceOf,
  createActionThrottleGuard,
  type ActionClientSource,
  type ActionGuardVerdict,
} from './action-throttle-guard';
import { ACTION_THROTTLED_TEXT } from './action-throttle-text';

const PAGE_URL = 'https://otakuleague.com/';
const VISITOR = '203.0.113.7';
const SAME_ORIGIN = {
  host: 'otakuleague.com',
  origin: 'https://otakuleague.com',
  'sec-fetch-site': 'same-origin',
};
type HeaderOverrides = Readonly<Record<string, string | undefined>>;

function setup(source: ActionClientSource = 'vercel') {
  const clock = { at: 1_000_000 };
  const now = () => clock.at;
  const perNetwork = createActionThrottle(DEFAULT_ACTION_THROTTLE_CONFIG, now);
  const perSite = createActionThrottle(ACTION_SITE_THROTTLE_CONFIG, now);
  const report = vi.fn();
  const guard = createActionThrottleGuard({
    keyOf: createActionThrottleKeyer(new Uint8Array(32).fill(7)),
    perNetwork,
    perSite,
    clientSource: () => source,
    reportClientIpUnknown: report,
  });
  const post = (overrides: HeaderOverrides = {}, ip: string = VISITOR) => {
    const all = {
      'next-action': 'a1',
      'x-forwarded-for': ip,
      ...SAME_ORIGIN,
      ...overrides,
    };
    const headers = Object.entries(all).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as [string, string]],
    );
    return guard(new NextRequest(PAGE_URL, { method: 'POST', headers }));
  };
  const postMany = (times: number, overrides?: HeaderOverrides, ip?: string) =>
    Array.from({ length: times }, () => post(overrides, ip));
  return { clock, perNetwork, perSite, report, guard, post, postMany };
}

const statusOf = (verdict: ActionGuardVerdict) =>
  verdict.kind === 'pass' ? 'pass' : verdict.response.status;
const passCount = (verdicts: readonly ActionGuardVerdict[]) =>
  verdicts.filter((verdict) => verdict.kind === 'pass').length;
function responseOf(verdict: ActionGuardVerdict): Response {
  if (verdict.kind === 'pass') throw new Error('expected an answer');
  return verdict.response;
}

describe('the cap (N23)', () => {
  it('lets 59 and 60 through and answers the 61st 429, so the action never runs', () => {
    const { post, postMany } = setup();

    expect(passCount(postMany(59))).toBe(59);
    expect(statusOf(post())).toBe('pass');
    expect(statusOf(post())).toBe(429);
  });

  it('answers text/plain, no-store, the throttle text and Retry-After to the window end', async () => {
    const { clock, post, postMany } = setup();
    postMany(60);
    expect(responseOf(post()).headers.get('retry-after')).toBe('60');

    clock.at += 59_001;
    const response = responseOf(post());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(await response.text()).toBe(ACTION_THROTTLED_TEXT);
  });

  it('starts again when the window ends', () => {
    const { clock, post, postMany } = setup();
    postMany(60);

    clock.at += 59_999;
    expect(statusOf(post())).toBe(429);
    clock.at += 1;
    expect(statusOf(post())).toBe('pass');
  });

  it('counts per network: an IPv4-mapped address as its IPv4, one /64 as one client', () => {
    const { post, postMany } = setup();
    postMany(60, {}, VISITOR);
    postMany(60, {}, '2001:db8:1:2::1');

    expect(statusOf(post({}, '::ffff:203.0.113.7'))).toBe(429);
    expect(statusOf(post({}, '2001:db8:1:2:ffff::9'))).toBe(429);
    expect(statusOf(post({}, '198.51.100.1'))).toBe('pass');
    expect(statusOf(post({}, '2001:db8:1:3::1'))).toBe('pass');
  });
});

describe('the same-site check (decision 11)', () => {
  it.each<[string, HeaderOverrides]>([
    ['Sec-Fetch-Site cross-site', { 'sec-fetch-site': 'cross-site' }],
    ['Sec-Fetch-Site same-site', { 'sec-fetch-site': 'same-site' }],
    ['Origin null', { origin: 'null' }],
    ['another Origin', { origin: 'https://evil.example' }],
  ])('answers %s 403 before counting it', async (_label, overrides) => {
    const { post, postMany } = setup();

    const refused = postMany(100, overrides);
    const response = responseOf(refused[0] ?? post());
    expect(refused.map(statusOf)).toEqual(new Array(100).fill(403));
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    expect(await response.text()).toBe(ACTION_CROSS_SITE_TEXT);
    expect(passCount(postMany(60))).toBe(60);
    expect(statusOf(post())).toBe(429);
  });

  it('counts a POST with neither Origin nor Sec-Fetch-Site (a script)', () => {
    const { post, postMany } = setup();
    const bare = { origin: undefined, 'sec-fetch-site': undefined };

    expect(passCount(postMany(60, bare))).toBe(60);
    expect(statusOf(post(bare))).toBe(429);
  });
});

describe('what is never counted', () => {
  it('lets GETs, the Sentry tunnel and a JSON POST through uncounted, cross-site ones too', () => {
    const { guard, post, postMany, perNetwork } = setup();
    const visitor = { 'x-forwarded-for': VISITOR, ...SAME_ORIGIN };
    const foreign = {
      ...visitor,
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    };
    const others = [
      new NextRequest(PAGE_URL, { headers: foreign }),
      new NextRequest(`${PAGE_URL}hikari`, {
        method: 'POST',
        headers: { ...foreign, 'content-type': 'text/plain' },
      }),
      new NextRequest(PAGE_URL, {
        headers: { ...visitor, 'next-action': 'a1' },
      }),
      new NextRequest(`${PAGE_URL}hikari`, {
        method: 'POST',
        headers: { ...visitor, 'content-type': 'text/plain;charset=UTF-8' },
      }),
      new NextRequest(`${PAGE_URL}api/x`, {
        method: 'POST',
        headers: { ...visitor, 'content-type': 'application/json' },
      }),
    ];

    for (let round = 0; round < 100; round += 1) {
      expect(others.map((request) => statusOf(guard(request)))).toEqual(
        new Array(others.length).fill('pass'),
      );
    }
    expect(perNetwork.size()).toBe(0);
    expect(passCount(postMany(60))).toBe(60);
    expect(statusOf(post())).toBe(429);
  });
});

describe('no client address (decisions 6 and 13)', () => {
  it.each<[string, string | undefined]>([
    ['missing', undefined],
    ['a list', '203.0.113.7, 198.51.100.1'],
    ['an address with a port', '203.0.113.7:443'],
  ])(
    'on Vercel, x-forwarded-for %s: every POST passes uncounted and is reported',
    (_label, forwardedFor) => {
      const { postMany, perNetwork, report } = setup('vercel');

      expect(
        passCount(postMany(100, { 'x-forwarded-for': forwardedFor })),
      ).toBe(100);
      expect(perNetwork.size()).toBe(0);
      expect(report).toHaveBeenCalledTimes(100);
    },
  );

  it('on one machine, counts every POST under the loopback key and never reads the header', () => {
    const { post, report } = setup('one_machine');

    for (let host = 1; host <= 60; host += 1) {
      expect(statusOf(post({}, `198.51.100.${host}`))).toBe('pass');
    }
    expect(statusOf(post({ 'x-forwarded-for': undefined }))).toBe(429);
    expect(report).not.toHaveBeenCalled();
  });

  it('on another host, passes uncounted and reports, never a shared bucket', () => {
    const { postMany, perNetwork, report } = setup('other_host');

    expect(passCount(postMany(100))).toBe(100);
    expect(perNetwork.size()).toBe(0);
    expect(report).toHaveBeenCalled();
  });

  it.each<[Record<string, string>, ActionClientSource]>([
    [{ VERCEL: '1', WEB_PUBLIC_URL: 'http://localhost:3000' }, 'vercel'],
    [{ WEB_PUBLIC_URL: 'http://localhost:3000' }, 'one_machine'],
    [{ VERCEL: '0', WEB_PUBLIC_URL: 'http://127.0.0.1:3000/' }, 'one_machine'],
    [{ WEB_PUBLIC_URL: 'https://otakuleague.com' }, 'other_host'],
    [{ WEB_PUBLIC_URL: 'http://example.com' }, 'other_host'],
    [{}, 'other_host'],
  ])('reads %o as %s', (env, source) => {
    expect(actionClientSourceOf(env)).toBe(source);
  });
});

describe('the IPv6 /48 tier (decision 12)', () => {
  it('is 300 per 60 s, with the default window and entries', () => {
    expect(ACTION_SITE_THROTTLE_CONFIG).toEqual({
      limit: 300,
      windowMs: 60_000,
      maxEntries: 10_000,
    });
  });

  it('caps one /48 at 300, counting only what each /64 was allowed', () => {
    const { post, postMany } = setup();
    const inSite = (subnet: number) => `2001:db8:1:${subnet}::1`;

    expect(passCount(postMany(100, {}, inSite(1)))).toBe(60);
    for (const subnet of [2, 3, 4, 5]) {
      expect(passCount(postMany(60, {}, inSite(subnet)))).toBe(60);
    }
    expect(responseOf(post({}, inSite(6))).headers.get('retry-after')).toBe(
      '60',
    );
    expect(statusOf(post({}, '2001:db8:2:1::1'))).toBe('pass');
    expect(statusOf(post({}, VISITOR))).toBe('pass');
  });

  it('refuses on a full /48 before counting the /64, with the /48 Retry-After', () => {
    const { clock, post, postMany, perNetwork } = setup();
    const inSite = (subnet: number) => `2001:db8:1:${subnet}::1`;
    for (const subnet of [1, 2, 3, 4, 5]) postMany(60, {}, inSite(subnet));
    expect(perNetwork.size()).toBe(5);

    clock.at += 10_000;
    for (let subnet = 6; subnet < 40; subnet += 1) {
      const refused = responseOf(post({}, inSite(subnet)));
      expect(refused.headers.get('retry-after')).toBe('50');
    }
    expect(perNetwork.size()).toBe(5);
  });
});

describe('memory and privacy (N25, decision 15)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops ended windows on every pass, even one that is no action POST', () => {
    const { clock, guard, post, perNetwork, perSite } = setup();
    post({}, '2001:db8:1:2::1');
    expect([perNetwork.size(), perSite.size()]).toEqual([1, 1]);

    clock.at += 60_000;
    guard(new NextRequest(PAGE_URL));
    expect([perNetwork.size(), perSite.size()]).toEqual([0, 0]);
  });

  it('puts no address in a response, a report or a log line', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { post, postMany, report } = setup();
    const ipv6 = '2001:db8:77:1::5';
    const verdicts = [
      post({ origin: 'https://evil.example' }),
      ...postMany(61),
      ...postMany(61, {}, ipv6),
      post({ 'x-forwarded-for': `${VISITOR}, ${ipv6}` }),
    ];

    for (const verdict of verdicts.filter((each) => each.kind === 'answer')) {
      const response = responseOf(verdict);
      const seen = [await response.text(), ...response.headers.values()].join(
        '\n',
      );
      for (const address of [VISITOR, '203.0.113', ipv6, '2001:db8']) {
        expect(seen).not.toContain(address);
      }
    }
    expect(report.mock.calls).toEqual([[]]);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
