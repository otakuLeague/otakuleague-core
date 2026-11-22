'use client';

import { unstable_rethrow } from 'next/navigation';
import { Component, type FormEvent, useActionState } from 'react';
import { signOutAction } from './sign-out-action';
import {
  type SignOutFormState,
  type SignOutThrownState,
  signOutStateFromThrow,
} from './sign-out-state';

// What the boundary mounts the form in: never `refused`, which only the action returns.
type SignOutInitialState = { readonly kind: 'idle' } | SignOutThrownState;

const IDLE: SignOutInitialState = { kind: 'idle' };

// `failed` asks for a reload: a page loaded before a deploy posts a stale action id until reloaded.
// `throttled` says "your network" (true behind a shared NAT) and "a minute" (both throttle windows
// are 60 s at most, tested); not the 429 body itself, whose "go back" is wrong in a menu.
const ALERT_TEXT: Record<Exclude<SignOutFormState['kind'], 'idle'>, string> = {
  refused: 'Could not sign out',
  failed: 'Could not sign out. Reload the page and try again.',
  throttled: 'Could not sign out: too many requests from your network. Wait a minute, then try again.',
};

function SignOutFormView({
  initialState,
}: {
  readonly initialState: SignOutInitialState;
}) {
  const [state, formAction, pending] = useActionState(
    signOutAction,
    initialState,
  );
  // Hidden while pending, so a repeated failure inserts a new alert node and is announced again.
  const showAlert = state.kind !== 'idle' && !pending;
  return (
    <form
      className="sh-menu__form"
      action={formAction}
      aria-busy={pending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        // One submit in flight (N7). Not `disabled`: that would drop focus out of the open menu.
        if (pending) {
          event.preventDefault();
        }
      }}
    >
      {/* Mounted again by the boundary after a throw: focus back on the button, not <body>. */}
      <button
        type="submit"
        className="sh-menu__action"
        aria-disabled={pending}
        autoFocus={initialState.kind !== 'idle'}
      >
        Sign out
      </button>
      {/* After the button, so an alert never moves it under the pointer. */}
      {showAlert && (
        <p className="sh-menu__alert" role="alert">
          {ALERT_TEXT[state.kind]}
        </p>
      )}
    </form>
  );
}

type SignOutBoundaryState = { readonly initialState: SignOutInitialState };

/**
 * The account menu's sign-out form, inside its own error boundary (ADR 0015 Addendum 1f-iv-c2). A
 * success is Next's redirect error, passed on by `unstable_rethrow` to the router's boundary. Any
 * other throw (the action threw, or never answered) mounts the form again in `failed`: the alert and
 * a Sign out button, never `global-error` (N2). After a stale action id (a deploy since the page
 * loaded) the button only works after a reload, so the `failed` alert says to reload (OTA-206). The
 * proxy throttle's 429 (its exact `text/plain` body as the error message) mounts it in `throttled`
 * instead, which says to wait (OTA-207).
 * Nothing is reported from the browser: a visitor can cause it, and a throw in the action is
 * reported by the server.
 */
export class SignOutForm extends Component<object, SignOutBoundaryState> {
  state: SignOutBoundaryState = { initialState: IDLE };

  static getDerivedStateFromError(error: unknown): SignOutBoundaryState {
    unstable_rethrow(error);
    return { initialState: signOutStateFromThrow(error) };
  }

  render() {
    return <SignOutFormView initialState={this.state.initialState} />;
  }
}
