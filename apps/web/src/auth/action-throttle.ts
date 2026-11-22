import { createHmac } from 'node:crypto';

export const ACTION_THROTTLE_LIMIT = 60;
export const ACTION_THROTTLE_WINDOW_MS = 60_000;
export const ACTION_THROTTLE_MAX_ENTRIES = 10_000;

declare const actionThrottleKeyBrand: unique symbol;

/** A keyed hash of a client network: never the address itself. Only `actionThrottleKey` makes one. */
export type ActionThrottleKey = string & {
  readonly [actionThrottleKeyBrand]: true;
};

export type ActionThrottleDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number };

export interface ActionThrottle {
  /** Counts one POST for the key, or refuses it (a refused POST is not counted). */
  count(key: ActionThrottleKey): ActionThrottleDecision;
  /** How many keys are held; never which. */
  size(): number;
}

export interface ActionThrottleConfig {
  readonly limit: number;
  readonly windowMs: number;
  readonly maxEntries: number;
}

export const DEFAULT_ACTION_THROTTLE_CONFIG: ActionThrottleConfig = {
  limit: ACTION_THROTTLE_LIMIT,
  windowMs: ACTION_THROTTLE_WINDOW_MS,
  maxEntries: ACTION_THROTTLE_MAX_ENTRIES,
};

/**
 * The counter's key: HMAC-SHA256 (base64url) of the client network (`clientNetworkOf`) under a
 * secret drawn once per instance, so a logged key or map gives no address (ADR 0015 Addendum
 * OTA-207, decision 3). Pure.
 */
export function actionThrottleKey(
  instanceSecret: Uint8Array,
  network: string,
): ActionThrottleKey {
  return createHmac('sha256', instanceSecret)
    .update(network)
    .digest('base64url') as ActionThrottleKey;
}

interface WindowCount {
  readonly windowStart: number;
  readonly posts: number;
}

/**
 * Fixed-window counter in this instance's memory (ADR 0015 Addendum OTA-207, decision 4). The
 * window starts at a key's first POST. Entries stay in window-start order: ended windows are
 * dropped from the front on each call, and at `maxEntries` the oldest goes first. No I/O, and
 * nothing lists the keys.
 */
export function createActionThrottle(
  { limit, windowMs, maxEntries }: ActionThrottleConfig,
  now: () => number,
): ActionThrottle {
  const windows = new Map<ActionThrottleKey, WindowCount>();

  function dropEndedWindows(at: number): void {
    for (const [key, { windowStart }] of windows) {
      if (windowStart + windowMs > at) return;
      windows.delete(key);
    }
  }

  return {
    count(key) {
      const at = now();
      dropEndedWindows(at);
      const current = windows.get(key);
      if (current === undefined) {
        if (windows.size >= maxEntries) {
          const oldest = windows.keys().next();
          if (oldest.done !== true) windows.delete(oldest.value);
        }
        windows.set(key, { windowStart: at, posts: 1 });
        return { kind: 'allowed' };
      }
      if (current.posts >= limit) {
        const remainingMs = current.windowStart + windowMs - at;
        return {
          kind: 'limited',
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        };
      }
      windows.set(key, { ...current, posts: current.posts + 1 });
      return { kind: 'allowed' };
    },
    size: () => windows.size,
  };
}
