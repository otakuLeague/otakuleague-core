import { createHmac, createSecretKey } from 'node:crypto';
import type { ClientNetwork } from '../api/client-ip';

export const ACTION_THROTTLE_LIMIT = 60;
export const ACTION_THROTTLE_WINDOW_MS = 60_000;
export const ACTION_THROTTLE_MAX_ENTRIES = 10_000;
export const ACTION_THROTTLE_MIN_SECRET_BYTES = 32;

declare const actionThrottleKeyBrand: unique symbol;

/** A keyed hash of a client network: never the address itself. Only the keyer makes one. */
export type ActionThrottleKey = string & {
  readonly [actionThrottleKeyBrand]: true;
};

export type ActionThrottleDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number };

export interface ActionThrottle {
  /** Counts one POST for the key, or refuses it (a refused POST is not counted). */
  take(key: ActionThrottleKey): ActionThrottleDecision;
  /** What `take` would answer now, counting and dropping nothing: a second tier refuses first with it. */
  peek(key: ActionThrottleKey): ActionThrottleDecision;
  /** Drops every ended window; the proxy calls it on each pass so no hash outlives its window long. */
  forgetEnded(): void;
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
 * The counter's keyer: HMAC-SHA256 (base64url) of a client network under a secret of at least 32
 * bytes drawn once per instance, so a logged key or map gives no address (ADR 0015 Addendum
 * OTA-207, decision 3). The secret is copied into a `KeyObject`; the caller's bytes can be
 * dropped. Throws on a short secret: a config error, never a visitor's doing.
 */
export function createActionThrottleKeyer(
  instanceSecret: Uint8Array,
): (network: ClientNetwork) => ActionThrottleKey {
  if (instanceSecret.byteLength < ACTION_THROTTLE_MIN_SECRET_BYTES) {
    throw new Error(
      `Invalid action throttle secret: at least ${ACTION_THROTTLE_MIN_SECRET_BYTES} bytes`,
    );
  }
  const secret = createSecretKey(instanceSecret);
  return (network) =>
    createHmac('sha256', secret)
      .update(network)
      .digest('base64url') as ActionThrottleKey;
}

interface WindowCount {
  readonly windowStart: number;
  readonly posts: number;
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid action throttle ${name}: ${String(value)}`);
  }
}

/**
 * Fixed-window counter in this instance's memory (ADR 0015 Addendum OTA-207, decision 4). The
 * window starts at a key's first POST. Entries stay in window-start order: ended windows are
 * dropped from the front on each call, and at `maxEntries` the oldest goes first. A clock that
 * steps back ends the window of an entry that now lies in its future. No I/O, nothing lists the
 * keys. Throws on a config that is not three positive safe integers.
 */
export function createActionThrottle(
  { limit, windowMs, maxEntries }: ActionThrottleConfig,
  nowMs: () => number,
): ActionThrottle {
  assertPositiveSafeInteger('limit', limit);
  assertPositiveSafeInteger('windowMs', windowMs);
  assertPositiveSafeInteger('maxEntries', maxEntries);
  const windows = new Map<ActionThrottleKey, WindowCount>();
  const maxRetryAfterSeconds = Math.ceil(windowMs / 1000);

  function dropEndedWindows(at: number): void {
    for (const [key, { windowStart }] of windows) {
      if (windowStart + windowMs > at) return;
      windows.delete(key);
    }
  }

  /**
   * The key's window if it is live at `at`. Checked per key, not only by the sweep: after a clock
   * step back, a live entry in front can stop the sweep before an ended one behind it.
   */
  function liveWindowOf(
    key: ActionThrottleKey,
    at: number,
  ): WindowCount | undefined {
    const current = windows.get(key);
    return current !== undefined &&
      current.windowStart <= at &&
      at < current.windowStart + windowMs
      ? current
      : undefined;
  }

  function decisionFor(
    current: WindowCount | undefined,
    at: number,
  ): ActionThrottleDecision {
    if (current === undefined || current.posts < limit) {
      return { kind: 'allowed' };
    }
    const remainingMs = current.windowStart + windowMs - at;
    return {
      kind: 'limited',
      retryAfterSeconds: Math.min(
        maxRetryAfterSeconds,
        Math.max(1, Math.ceil(remainingMs / 1000)),
      ),
    };
  }

  return {
    take(key) {
      const at = nowMs();
      dropEndedWindows(at);
      const current = liveWindowOf(key, at);
      const decision = decisionFor(current, at);
      if (decision.kind === 'limited') return decision;
      if (current !== undefined) {
        windows.set(key, { ...current, posts: current.posts + 1 });
        return decision;
      }
      windows.delete(key);
      if (windows.size >= maxEntries) {
        const oldest = windows.keys().next();
        if (oldest.done !== true) windows.delete(oldest.value);
      }
      windows.set(key, { windowStart: at, posts: 1 });
      return decision;
    },
    peek(key) {
      const at = nowMs();
      return decisionFor(liveWindowOf(key, at), at);
    },
    forgetEnded: () => dropEndedWindows(nowMs()),
    size: () => windows.size,
  };
}
