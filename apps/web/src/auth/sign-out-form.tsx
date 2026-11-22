'use client';

import { unstable_rethrow } from 'next/navigation';
import { Component, type FormEvent, useActionState } from 'react';
import { signOutAction } from './sign-out-action';
import type { SignOutFormState } from './sign-out-state';

const IDLE: SignOutFormState = { kind: 'idle' };
const FAILED: SignOutFormState = { kind: 'failed' };

function SignOutFormView({
  initialState,
}: {
  readonly initialState: SignOutFormState;
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
        autoFocus={initialState.kind === 'failed'}
      >
        Sign out
      </button>
      {/* After the button, so an alert never moves it under the pointer. */}
      {showAlert && (
        <p className="sh-menu__alert" role="alert">
          Could not sign out
        </p>
      )}
    </form>
  );
}

type SignOutBoundaryState = { readonly initialState: SignOutFormState };

/**
 * The account menu's sign-out form, inside its own error boundary (ADR 0015 Addendum 1f-iv-c2). A
 * success is Next's redirect error, passed on by `unstable_rethrow` to the router's boundary. Any
 * other throw (the action threw, or never answered) mounts the form again in `failed`: the alert and
 * a Sign out button that works without a reload, never `global-error` (N2). Nothing is reported from
 * the browser: a visitor can cause it, and a throw in the action is reported by the server.
 */
export class SignOutForm extends Component<object, SignOutBoundaryState> {
  state: SignOutBoundaryState = { initialState: IDLE };

  static getDerivedStateFromError(error: unknown): SignOutBoundaryState {
    unstable_rethrow(error);
    return { initialState: FAILED };
  }

  render() {
    return <SignOutFormView initialState={this.state.initialState} />;
  }
}
