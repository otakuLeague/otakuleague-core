'use client';

import { type ReactNode, useActionState, useState } from 'react';
import { signInAction } from './sign-in-action';
import type { SignInFormState } from './sign-in-form-state';
import { SignInFormView } from './sign-in-form-view';

const IDLE: SignInFormState = { kind: 'idle' };

/**
 * The sign-in form's state: the action's last answer and the last submitted identifier, the field's
 * default, so React's form reset after a failed attempt puts it back (both fields stay uncontrolled,
 * so typing or autofill before hydration is never overwritten). The password is never kept, so that
 * reset clears it. `children` are the request's extra fields (`next`).
 */
export function SignInForm({ children }: { readonly children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE);
  const [identifier, setIdentifier] = useState('');
  return (
    <SignInFormView
      state={state}
      pending={pending}
      identifier={identifier}
      onIdentifierSubmit={setIdentifier}
      formAction={formAction}
    >
      {children}
    </SignInFormView>
  );
}
