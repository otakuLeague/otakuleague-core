// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as throttleModule from './action-throttle';
import {
  ACTION_THROTTLE_LIMIT,
  ACTION_THROTTLE_MAX_ENTRIES,
  ACTION_THROTTLE_WINDOW_MS,
  actionThrottleKey,
  createActionThrottle,
  DEFAULT_ACTION_THROTTLE_CONFIG,
  type ActionThrottleKey,
} from './action-throttle';

const SECRET = new Uint8Array(32).fill(7);
const keyOf = (network: string) => actionThrottleKey(SECRET, network);
const KEY = keyOf('203.0.113.7');

function setup(config = DEFAULT_ACTION_THROTTLE_CONFIG) {
  const clock = { at: 1_000_000 };
  const throttle = createActionThrottle(config, () => clock.at);
  return { clock, throttle };
}

function countTimes(
  throttle: ReturnType<typeof createActionThrottle>,
  key: ActionThrottleKey,
  times: number,
) {
  for (let post = 0; post < times; post += 1) throttle.count(key);
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
  it('allows the first POST and holds one entry', () => {
    const { throttle } = setup();

    expect(throttle.count(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(1);
  });

  it('is empty before any POST', () => {
    expect(setup().throttle.size()).toBe(0);
  });

  it('allows up to the cap and limits the 61st', () => {
    const { throttle } = setup();

    countTimes(throttle, KEY, 59);
    expect(throttle.count(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.count(KEY)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 60,
    });
  });

  it('counts each key on its own', () => {
    const { throttle } = setup();

    countTimes(throttle, KEY, 60);

    expect(throttle.count(keyOf('203.0.113.8'))).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(2);
  });

  it('starts a new window once the first one has ended', () => {
    const { clock, throttle } = setup();
    countTimes(throttle, KEY, 61);

    clock.at += ACTION_THROTTLE_WINDOW_MS - 1;
    expect(throttle.count(KEY).kind).toBe('limited');
    clock.at += 1;

    expect(throttle.count(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.size()).toBe(1);
  });

  it('answers a Retry-After of whole seconds from 1 to 60', () => {
    const { clock, throttle } = setup();
    countTimes(throttle, KEY, 60);
    const retryAfter = () => {
      const decision = throttle.count(KEY);
      return decision.kind === 'limited' ? decision.retryAfterSeconds : -1;
    };

    expect(retryAfter()).toBe(60);
    clock.at += 1;
    expect(retryAfter()).toBe(60);
    clock.at += 29_000;
    expect(retryAfter()).toBe(31);
    clock.at += 29_999;
    expect(retryAfter()).toBe(1);
  });

  it('does not count a refused POST or extend the window', () => {
    const { clock, throttle } = setup();
    countTimes(throttle, KEY, 60);
    clock.at += 59_000;

    countTimes(throttle, KEY, 500);
    clock.at += 1_000;

    expect(throttle.count(KEY)).toEqual({ kind: 'allowed' });
    countTimes(throttle, KEY, 58);
    expect(throttle.count(KEY)).toEqual({ kind: 'allowed' });
    expect(throttle.count(KEY).kind).toBe('limited');
  });

  it('drops the oldest entry first when maxEntries is reached', () => {
    const { clock, throttle } = setup({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 3,
    });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(keyOf) as [
      ActionThrottleKey,
      ActionThrottleKey,
      ActionThrottleKey,
      ActionThrottleKey,
    ];
    for (const key of [a, b, c]) {
      throttle.count(key);
      clock.at += 1;
    }

    throttle.count(d);

    expect(throttle.size()).toBe(3);
    expect(throttle.count(b).kind).toBe('limited');
    expect(throttle.count(a)).toEqual({ kind: 'allowed' });
  });

  it('drops ended windows from the front, keeping live ones', () => {
    const { clock, throttle } = setup();
    throttle.count(keyOf('old'));
    clock.at += 30_000;
    throttle.count(keyOf('newer'));
    clock.at += 30_000;

    throttle.count(keyOf('newest'));

    expect(throttle.size()).toBe(2);
  });

  it('keeps a key that restarted behind the ones that began before it', () => {
    const { clock, throttle } = setup({
      limit: 1,
      windowMs: 100,
      maxEntries: 2,
    });
    throttle.count(keyOf('a'));
    clock.at += 50;
    throttle.count(keyOf('b'));
    clock.at += 60;
    throttle.count(keyOf('a'));

    clock.at += 50;

    expect(throttle.count(keyOf('b'))).toEqual({ kind: 'allowed' });
    expect(throttle.count(keyOf('a')).kind).toBe('limited');
  });
});

describe('actionThrottleKey', () => {
  it('is deterministic per secret and network', () => {
    expect(keyOf('203.0.113.7')).toBe(keyOf('203.0.113.7'));
    expect(keyOf('203.0.113.7')).not.toBe(keyOf('203.0.113.8'));
    expect(keyOf('2001:db8:1:2::/64')).not.toBe(keyOf('2001:db8:1:3::/64'));
  });

  it('changes with the instance secret', () => {
    expect(actionThrottleKey(new Uint8Array(32).fill(8), '203.0.113.7')).not.toBe(
      KEY,
    );
  });

  it('is 43 base64url characters and never holds the address', () => {
    for (const network of ['203.0.113.7', '2001:db8:1:2::/64']) {
      const key = keyOf(network);

      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(key).not.toContain(network);
      expect(key).not.toContain('203.0.113');
      expect(key).not.toContain('2001');
    }
  });
});

describe('privacy', () => {
  it('exports no way to list the keys or read an address', () => {
    expect(Object.keys(throttleModule).sort()).toEqual([
      'ACTION_THROTTLE_LIMIT',
      'ACTION_THROTTLE_MAX_ENTRIES',
      'ACTION_THROTTLE_WINDOW_MS',
      'DEFAULT_ACTION_THROTTLE_CONFIG',
      'actionThrottleKey',
      'createActionThrottle',
    ]);
    expect(Object.keys(setup().throttle).sort()).toEqual(['count', 'size']);
  });

  it('holds no address in what a decision or the throttle shows', () => {
    const { throttle } = setup();
    countTimes(throttle, KEY, 61);

    const shown = JSON.stringify([
      throttle.count(KEY),
      throttle.size(),
      Object.keys(throttle),
    ]);

    expect(shown).not.toContain('203.0.113.7');
  });
});
