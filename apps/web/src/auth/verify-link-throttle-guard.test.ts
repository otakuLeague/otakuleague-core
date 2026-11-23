// @vitest-environment node
import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createActionThrottle,
  createActionThrottleKeyer,
} from './action-throttle';
import type {
  ActionClientSource,
  ActionGuardVerdict,
} from './action-throttle-guard';
import { EMAIL_LINK_LANDINGS } from './email-link';
import {
  createVerifyLinkThrottleGuard,
  VERIFY_LINK_THROTTLE_CONFIG,
} from './verify-link-throttle-guard';

const TOKEN = 'Vk3'.padEnd(43, 'q');
const LINK_URL = `https://otakuleague.com${EMAIL_VERIFICATION_LINK.path}?${EMAIL_VERIFICATION_LINK.tokenParam}=${TOKEN}`;
const VISITOR = '203.0.113.7';
const WINDOW_MS = 15 * 60_000;
/** What a browser sends when a person opens the link from a mail. */
const CLICK = {
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'none',
};
type HeaderOverrides = Readonly<Record<string, string | undefined>>;
interface Opening {
  readonly url?: string;
  readonly method?: string;
  readonly headers?: HeaderOverrides;
  readonly ip?: string;
}

function setup(source: ActionClientSource = 'vercel') {
  const clock = { at: 1_000_000 };
  const perNetwork = createActionThrottle(
    VERIFY_LINK_THROTTLE_CONFIG,
    () => clock.at,
  );
  const guard = createVerifyLinkThrottleGuard({
    keyOf: createActionThrottleKeyer(new Uint8Array(32).fill(7)),
    perNetwork,
    clientSource: () => source,
  });
  const open = ({
    url = LINK_URL,
    method = 'GET',
    headers: overrides = {},
    ip = VISITOR,
  }: Opening = {}) => {
    const all = { 'x-forwarded-for': ip, ...CLICK, ...overrides };
    const headers = Object.entries(all).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as [string, string]],
    );
    return guard(new Request(url, { method, headers }));
  };
  const openMany = (times: number, opening?: Opening) =>
    Array.from({ length: times }, () => open(opening));
  return { clock, perNetwork, open, openMany };
}

const statusOf = (verdict: ActionGuardVerdict) =>
  verdict.kind === 'pass' ? 'pass' : verdict.response.status;
const passCount = (verdicts: readonly ActionGuardVerdict[]) =>
  verdicts.filter((verdict) => verdict.kind === 'pass').length;
function responseOf(verdict: ActionGuardVerdict): Response {
  if (verdict.kind === 'pass') throw new Error('expected an answer');
  return verdict.response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the cap', () => {
  it('is 10 per network every 15 minutes, with room for 10,000 networks', () => {
    expect(VERIFY_LINK_THROTTLE_CONFIG).toEqual({
      limit: 10,
      windowMs: WINDOW_MS,
      maxEntries: 10_000,
    });
  });

  it('lets the 1st and the 10th through and sends the 11th to try-again', () => {
    const { open, openMany } = setup();

    expect(statusOf(open())).toBe('pass');
    expect(passCount(openMany(8))).toBe(8);
    expect(statusOf(open())).toBe('pass');
    const refused = responseOf(open());
    expect(refused.status).toBe(303);
    expect(refused.headers.get('location')).toBe(EMAIL_LINK_LANDINGS.tryAgain);
  });

  it('does not count a refused opening: the next window holds exactly 10 again', () => {
    const { clock, openMany } = setup();
    openMany(10);

    expect(passCount(openMany(50))).toBe(0);
    clock.at += WINDOW_MS;
    expect(passCount(openMany(11))).toBe(10);
  });

  it('starts again when the window ends, not a millisecond before', () => {
    const { clock, open, openMany } = setup();
    openMany(10);

    clock.at += WINDOW_MS - 1;
    expect(statusOf(open())).toBe(303);
    clock.at += 1;
    expect(statusOf(open())).toBe('pass');
  });

  it('counts per IPv6 /64, with no /48 tier', () => {
    const { open, openMany } = setup();
    openMany(10, { ip: '2001:db8:1:2::1' });

    expect(statusOf(open({ ip: '2001:db8:1:2::ffff' }))).toBe(303);
    expect(passCount(openMany(10, { ip: '2001:db8:1:3::1' }))).toBe(10);
    expect(passCount(openMany(10, { ip: '2001:db8:1:4::1' }))).toBe(10);
    expect(statusOf(open({ ip: '198.51.100.1' }))).toBe('pass');
  });
});

describe('what is never counted (the handler makes 0 calls for it)', () => {
  it.each<[string, Opening]>([
    ['a prefetch', { headers: { 'sec-purpose': 'prefetch' } }],
    ['a legacy prefetch', { headers: { purpose: 'prefetch' } }],
    ['a HEAD', { method: 'HEAD' }],
    ['a POST', { method: 'POST' }],
    [
      'an image tag',
      { headers: { 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors' } },
    ],
    ['a frame', { headers: { 'sec-fetch-dest': 'iframe' } }],
    [
      'a fetch',
      { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } },
    ],
    ['no token', { url: 'https://otakuleague.com/auth/verify' }],
    [
      'a short token',
      { url: `https://otakuleague.com/auth/verify?token=${TOKEN.slice(1)}` },
    ],
    ['two tokens', { url: `${LINK_URL}&token=${TOKEN}` }],
    [
      'a landing',
      {
        url: `https://otakuleague.com${EMAIL_LINK_LANDINGS.tryAgain}?token=${TOKEN}`,
      },
    ],
    [
      'another path',
      { url: `https://otakuleague.com/auth/verify/x?token=${TOKEN}` },
    ],
    [
      'the sign-in page',
      { url: `https://otakuleague.com/auth?token=${TOKEN}` },
    ],
    [
      'an unknown client on Vercel',
      { headers: { 'x-forwarded-for': undefined } },
    ],
    ['a list of addresses on Vercel', { ip: '203.0.113.7, 198.51.100.1' }],
    [
      'a path that cannot be decoded',
      { url: `https://otakuleague.com/auth/verify%?token=${TOKEN}` },
    ],
    [
      'a landing spelled with escapes',
      { url: `https://otakuleague.com/auth/verify/%74ry-again?token=${TOKEN}` },
    ],
  ])('%s passes uncounted, the cap reached or not', (_label, opening) => {
    const { perNetwork, openMany } = setup();

    expect(passCount(openMany(30, opening))).toBe(30);
    expect(perNetwork.size()).toBe(0);
    expect(passCount(openMany(11))).toBe(10);
    expect(passCount(openMany(5, opening))).toBe(5);
  });

  it('lets the click through after 10 prefetches of the same link', () => {
    const { open, openMany } = setup();

    openMany(10, { headers: { 'sec-purpose': 'prefetch;prerender' } });
    expect(statusOf(open())).toBe('pass');
  });

  it('counts an opening from a mail app that sends no Fetch Metadata', () => {
    const noMetadata = {
      'sec-fetch-mode': undefined,
      'sec-fetch-dest': undefined,
      'sec-fetch-site': undefined,
    };
    const { open, openMany } = setup();

    expect(passCount(openMany(10, { headers: noMetadata }))).toBe(10);
    expect(statusOf(open({ headers: noMetadata }))).toBe(303);
  });
});

describe('the path as Next routes it (decoded, one trailing slash)', () => {
  it.each<[string, string]>([
    ['an escaped letter', '/auth/%76erify'],
    ['an escaped first segment', '/%61uth/verify'],
    ['an escaped slash', '/auth%2Fverify'],
    ['a trailing slash', '/auth/verify/'],
  ])('counts %s on the same budget as the plain link', (_label, path) => {
    const { open, openMany } = setup();
    const url = `https://otakuleague.com${path}?token=${TOKEN}`;

    expect(passCount(openMany(5, { url }))).toBe(5);
    expect(passCount(openMany(5))).toBe(5);
    expect(statusOf(open({ url }))).toBe(303);
    expect(statusOf(open())).toBe(303);
  });
});

describe('where the client comes from', () => {
  it('on one machine, counts every opening under the loopback key, whatever the header says', () => {
    const { open } = setup('one_machine');

    for (let host = 1; host <= 10; host += 1) {
      expect(statusOf(open({ ip: `198.51.100.${host}` }))).toBe('pass');
    }
    expect(statusOf(open({ headers: { 'x-forwarded-for': undefined } }))).toBe(
      303,
    );
  });

  it('on another host, passes uncounted: the handler refuses with 0 calls there', () => {
    const { perNetwork, openMany } = setup('other_host');

    expect(passCount(openMany(30))).toBe(30);
    expect(perNetwork.size()).toBe(0);
  });
});

describe('memory and privacy', () => {
  it('drops ended windows on every pass, even one that is no link opening', () => {
    const { clock, perNetwork, open } = setup();
    open();
    expect(perNetwork.size()).toBe(1);

    clock.at += WINDOW_MS;
    open({ url: 'https://otakuleague.com/anime/naruto' });
    expect(perNetwork.size()).toBe(0);
  });

  it('answers bodiless, no-store and with no token, address or cookie, and logs nothing', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((level) => vi.spyOn(console, level));
    const { openMany, open } = setup();
    openMany(10);

    const response = responseOf(open());
    const headerText = JSON.stringify([...response.headers.entries()]);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(headerText).not.toContain(TOKEN);
    expect(headerText).not.toContain(VISITOR);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
