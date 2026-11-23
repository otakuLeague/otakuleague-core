'use client';

import { useActionState } from 'react';
import { confirmEmailAction } from './confirm-email-action';
import type { ConfirmEmailFormState } from './confirm-email-form-state';
import { ConfirmEmailFormView } from './confirm-email-form-view';

const IDLE: ConfirmEmailFormState = { kind: 'idle' };

/** The password page's form state: only the action's last answer, never the password. */
export function ConfirmEmailForm() {
  const [state, formAction, pending] = useActionState(confirmEmailAction, IDLE);
  return (
    <ConfirmEmailFormView
      state={state}
      pending={pending}
      formAction={formAction}
    />
  );
}
