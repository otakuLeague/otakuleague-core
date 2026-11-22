'use client';

import { useActionState, useState } from 'react';
import { signUpAction } from './sign-up-action';
import type { SignUpFormState } from './sign-up-form-state';
import { type SignUpKeptFields, SignUpFormView } from './sign-up-form-view';

const IDLE: SignUpFormState = { kind: 'idle' };
const EMPTY: SignUpKeptFields = { username: '', email: '' };

/**
 * The sign-up form's state (ADR 0015 Addendum 1f-v3): the action's last answer and the last submitted
 * username and email, the fields' defaults, so React's reset after a refusal restores them. The
 * password is never kept (N30), so that reset clears it.
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, IDLE);
  const [kept, setKept] = useState(EMPTY);
  return (
    <SignUpFormView
      state={state}
      pending={pending}
      kept={kept}
      onFieldsSubmit={setKept}
      formAction={formAction}
    />
  );
}
