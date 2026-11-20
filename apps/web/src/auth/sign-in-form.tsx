'use client';

import { type ReactNode, useActionState, useState } from 'react';
import { signInAction } from './sign-in-action';
import type { SignInFormState } from './sign-in-form-state';
import { SignInFormView } from './sign-in-form-view';

const IDLE: SignInFormState = { kind: 'idle' };

/**
 * The sign-in form's state: the action's last answer and the identifier, held here so it survives
 * React's form reset after a failed attempt. The password stays uncontrolled, so that reset clears
 * it and it never sits in React state. `children` are the request's extra fields (`next`).
 */
export function SignInForm({ children }: { readonly children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE);
  const [identifier, setIdentifier] = useState('');
  return (
    <SignInFormView
      state={state}
      pending={pending}
      identifier={identifier}
      onIdentifierChange={setIdentifier}
      formAction={formAction}
    >
      {children}
    </SignInFormView>
  );
}
