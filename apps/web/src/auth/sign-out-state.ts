import { ACTION_THROTTLED_TEXT } from './action-throttle-text';

/**
 * The sign-out form's state (ADR 0015 Addendum 1f-iv-c2). `refused` is the action's one answer (a
 * preview, or an `Origin` that is not `WEB_PUBLIC_URL`'s); `failed` and `throttled` are never
 * returned by the action, only set by the form's error boundary (a throw, or no answer; `throttled`
 * when the proxy's 429 refused the POST, OTA-207). Success is a redirect, not a state.
 */
export type SignOutFormState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'throttled' };

/** The states the form's error boundary can set. */
export type SignOutThrownState = Extract<
  SignOutFormState,
  { readonly kind: 'failed' | 'throttled' }
>;

/**
 * What a throw from the sign-out action means (call after `unstable_rethrow`). Next's client turns
 * the throttle's 429 `text/plain` answer into `new Error(body)`, so only that exact message is
 * `throttled`; anything else is `failed`.
 */
export function signOutStateFromThrow(error: unknown): SignOutThrownState {
  return error instanceof Error && error.message === ACTION_THROTTLED_TEXT
    ? { kind: 'throttled' }
    : { kind: 'failed' };
}
