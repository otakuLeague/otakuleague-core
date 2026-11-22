/**
 * The sign-out form's state (ADR 0015 Addendum 1f-iv-c2). `refused` is the action's one answer (a
 * preview, or an `Origin` that is not `WEB_PUBLIC_URL`'s); `failed` is never returned by the action,
 * only set by the form's error boundary (a throw, or no answer). Success is a redirect, not a state.
 */
export type SignOutFormState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'failed' };
