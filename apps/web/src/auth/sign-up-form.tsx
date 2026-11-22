'use client';

import { useActionState, useEffect, useState } from 'react';
import { SIGN_IN_PASSWORD_ID } from './sign-in-form-view';
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
  useEffect(emptySignInPassword, []);
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

/**
 * "Create one" changes only the query, so Next keeps `/auth` visible and the sign-in panel is hidden
 * by CSS alone: no `<Activity>` hide, so `clearOnHide` never runs there. The sign-up panel mounts
 * only in sign-up mode (links and back/forward alike), so it empties the sign-in password itself.
 * Its value is never read.
 */
function emptySignInPassword() {
  const signInPassword = document.getElementById(SIGN_IN_PASSWORD_ID);
  if (signInPassword instanceof HTMLInputElement) {
    signInPassword.value = '';
  }
}
