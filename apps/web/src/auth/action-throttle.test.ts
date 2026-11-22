// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ClientNetwork } from '../api/client-ip';
import * as throttleModule from './action-throttle';
import {
  ACTION_THROTTLE_LIMIT,
  ACTION_THROTTLE_MAX_ENTRIES,
  ACTION_THROTTLE_WINDOW_MS,
  createActionThrottle,
  createActionThrottleKeyer,
  DEFAULT_ACTION_THROTTLE_CONFIG,
  type ActionThrottle,
  type ActionThrottleKey,
} from './action-throttle';

const keyer = createActionThrottleKeyer(new Uint8Array(32).fill(7));
const keyOf = (network: string) => keyer(network as ClientNetwork);
const KEY = keyOf('203.0.113.7');

function setup(config = DEFAULT_ACTION_THROTTLE_CONFIG) {
  const clock = { at: 1_000_000 };
  const throttle = createActionThrottle(config, () => clock.at);
  return { clock, throttle };
}

function take(throttle: ActionThrottle, key: ActionThrottleKey, times: number) {
  for (let post = 0; post < times; post += 1) throttle.take(key);
}

function retryAfterOf(throttle: ActionThrottle, key: ActionThrottleKey) {
  const decision = throttle.take(key);
  return decision.kind === 'limited' ? decision.retryAfterSeconds : -1;
}

describe('the default numbers', () => {
  it('are 60 POSTs per 60 s and 10,000 entries', () => {
    expect(ACTION_THROTTLE_LIMIT).toBe(60);
    expect(ACTION_THROTTLE_WINDOW_MS).toBe(60_000);
    expect(ACTION_THROTTLE_MAX_ENTRIES).toBe(10_000);
    expect(DEFAULT_ACTION_THROTTLE_CONFIG).toEqual({
      limit: 60,
      windowMs: 60_000,
      maxEntries: 10_000,
    });
  });
});

describe('createActionThrottle', () => {
  it('is empty before any POST', () => {
    expect(setup().throttle.size()).toBe(0);
  });

  it('allows the first POST and holds one entry', () => {
    const { throttle } = setup();

    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(1);
  });

  it('allows up to the cap and limits the 61st', () => {
    const { throttle } = setup();

    take(throttle, KEY, 59);
    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.take(KEY)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 60,
    });
  });

  it('counts each key on its own', () => {
    const { throttle } = setup();
    take(throttle, KEY, 60);

    expect(throttle.take(keyOf('203.0.113.8'))).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(2);
  });

  it('starts a new window once the first one has ended', () => {
    const { clock, throttle } = setup();
    take(throttle, KEY, 61);

    clock.at += ACTION_THROTTLE_WINDOW_MS - 1;
    expect(throttle.take(KEY).kind).toBe('limited');
    clock.at += 1;

    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(1);
  });

  it('answers a Retry-After of whole seconds from 1 to 60', () => {
    const { clock, throttle } = setup();
    take(throttle, KEY, 60);

    expect(retryAfterOf(throttle, KEY)).toBe(60);
    clock.at += 1;
    expect(retryAfterOf(throttle, KEY)).toBe(60);
    clock.at += 29_000;
    expect(retryAfterOf(throttle, KEY)).toBe(31);
    clock.at += 29_999;
    expect(retryAfterOf(throttle, KEY)).toBe(1);
  });

  it('answers 1 with 1 ms left', () => {
    const { clock, throttle } = setup();
    take(throttle, KEY, 60);
    clock.at += ACTION_THROTTLE_WINDOW_MS - 1;

    expect(retryAfterOf(throttle, KEY)).toBe(1);
  });

  it('does not count a refused POST or extend the window', () => {
    const { clock, throttle } = setup();
    take(throttle, KEY, 60);
    clock.at += 59_000;

    take(throttle, KEY, 500);
    clock.at += 1_000;

    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    take(throttle, KEY, 58);
    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.take(KEY).kind).toBe('limited');
  });

  it('starts again when the clock steps back, and keeps Retry-After in 1 to 60', () => {
    const { clock, throttle } = setup();
    take(throttle, KEY, 60);

    clock.at -= 5_000;

    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    take(throttle, KEY, 59);
    expect(retryAfterOf(throttle, KEY)).toBe(60);
  });

  it('keeps Retry-After at most 60 when the clock steps back by a day', () => {
    const { clock, throttle } = setup({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 5,
    });
    throttle.take(KEY);
    throttle.take(keyOf('other'));
    clock.at -= 86_400_000;

    expect(throttle.take(KEY)).toEqual({ kind: 'allowed' });
    expect(retryAfterOf(throttle, KEY)).toBe(60);
  });

  it('drops the oldest entry first when maxEntries is reached', () => {
    const { clock, throttle } = setup({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 3,
    });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(keyOf);
    for (const key of [a, b, c]) {
      throttle.take(key as ActionThrottleKey);
      clock.at += 1;
    }

    throttle.take(d as ActionThrottleKey);

    expect(throttle.size()).toBe(3);
    expect(throttle.take(b as ActionThrottleKey).kind).toBe('limited');
    expect(throttle.take(a as ActionThrottleKey)).toEqual({ kind: 'allowed' });
  });

  it('evicts by window start, not by latest use', () => {
    const { clock, throttle } = setup({
      limit: 5,
      windowMs: 60_000,
      maxEntries: 2,
    });
    const [a, b, c] = ['a', 'b', 'c'].map(keyOf) as [
      ActionThrottleKey,
      ActionThrottleKey,
      ActionThrottleKey,
    ];
    throttle.take(a);
    clock.at += 1;
    throttle.take(b);
    clock.at += 1;
    throttle.take(a);
    clock.at += 1;

    throttle.take(c);

    expect(throttle.size()).toBe(2);
    take(throttle, b, 4);
    expect(throttle.take(b).kind).toBe('limited');
    take(throttle, a, 4);
    expect(throttle.take(a)).toEqual({ kind: 'allowed' });
  });

  it('drops an ended window from the front while a later one is live', () => {
    const { clock, throttle } = setup();
    throttle.take(keyOf('a'));
    clock.at += 30_000;
    throttle.take(keyOf('b'));
    expect(throttle.size()).toBe(2);

    clock.at += 30_000;
    throttle.take(KEY);

    expect(throttle.size()).toBe(2);
  });

  it('keeps a restarted key behind the ones that began before it', () => {
    const { clock, throttle } = setup({
      limit: 1,
      windowMs: 100,
      maxEntries: 2,
    });
    const [a, b] = ['a', 'b'].map(keyOf) as [
      ActionThrottleKey,
      ActionThrottleKey,
    ];
    throttle.take(a);
    clock.at += 50;
    throttle.take(b);
    clock.at += 60;
    throttle.take(a);
    clock.at += 50;

    expect(throttle.take(b)).toEqual({ kind: 'allowed' });
    expect(throttle.take(a).kind).toBe('limited');
  });

  it('forgets ended windows on request and keeps live ones', () => {
    const { clock, throttle } = setup();
    throttle.take(keyOf('a'));
    clock.at += 30_000;
    throttle.take(keyOf('b'));

    throttle.forgetEnded();
    expect(throttle.size()).toBe(2);
    clock.at += 30_000;
    throttle.forgetEnded();
    expect(throttle.size()).toBe(1);
    clock.at += 30_000;
    throttle.forgetEnded();
    expect(throttle.size()).toBe(0);
  });

  it.each([
    ['a zero limit', { limit: 0, windowMs: 1, maxEntries: 1 }],
    ['a negative window', { limit: 1, windowMs: -1, maxEntries: 1 }],
    ['a fractional window', { limit: 1, windowMs: 1.5, maxEntries: 1 }],
    ['an unsafe max', { limit: 1, windowMs: 1, maxEntries: 2 ** 53 }],
    ['NaN', { limit: Number.NaN, windowMs: 1, maxEntries: 1 }],
  ])('refuses %s', (_label, config) => {
    expect(() => createActionThrottle(config, () => 0)).toThrow(
      'Invalid action throttle',
    );
  });
});

describe('createActionThrottleKeyer', () => {
  it('is deterministic per secret and network', () => {
    expect(keyOf('203.0.113.7')).toBe(keyOf('203.0.113.7'));
    expect(keyOf('203.0.113.7')).not.toBe(keyOf('203.0.113.8'));
    expect(keyOf('2001:db8:1:2::/64')).not.toBe(keyOf('2001:db8:1:3::/64'));
  });

  it('gives two secrets two keys for one network', () => {
    const other = createActionThrottleKeyer(new Uint8Array(32).fill(8));

    expect(other('203.0.113.7' as ClientNetwork)).not.toBe(KEY);
  });

  it('refuses a secret under 32 bytes', () => {
    expect(() => createActionThrottleKeyer(new Uint8Array(31))).toThrow(
      'Invalid action throttle secret',
    );
  });

  it('is 43 base64url characters and does not contain the network', () => {
    for (const network of ['203.0.113.7', '2001:db8:1:2::/64']) {
      const key = keyOf(network);

      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(key).not.toContain(network);
    }
  });
});

describe('privacy', () => {
  it('exports no lister of keys and a throttle with no way to read them', () => {
    expect(Object.keys(throttleModule).sort()).toEqual([
      'ACTION_THROTTLE_LIMIT',
      'ACTION_THROTTLE_MAX_ENTRIES',
      'ACTION_THROTTLE_MIN_SECRET_BYTES',
      'ACTION_THROTTLE_WINDOW_MS',
      'DEFAULT_ACTION_THROTTLE_CONFIG',
      'createActionThrottle',
      'createActionThrottleKeyer',
    ]);
    expect(Object.keys(setup().throttle).sort()).toEqual([
      'forgetEnded',
      'size',
      'take',
    ]);
  });
});
