'use client';

import type { SignUpPasswordRules } from '@otakuleague/shared-types';
import { useActionState, useEffect, useLayoutEffect, useState } from 'react';
import { SIGN_IN_PASSWORD_ID } from './sign-in-form-view';
import { signUpAction } from './sign-up-action';
import type { SignUpFormState } from './sign-up-form-state';
import { type SignUpKeptFields, SignUpFormView } from './sign-up-form-view';
import type { SignUpSubmitBlock } from './sign-up-password-checks';

const IDLE: SignUpFormState = { kind: 'idle' };
const EMPTY: SignUpKeptFields = { username: '', email: '' };
const sameRules = (a: SignUpPasswordRules, b: SignUpPasswordRules) =>
  a.longEnough === b.longEnough && a.hasDigitOrSymbol === b.hasDigitOrSymbol;
const UNMET: SignUpPasswordRules = {
  longEnough: false,
  hasDigitOrSymbol: false,
};

/**
 * The sign-up form's state (ADR 0015 Addendum 1f-v3): the action's last answer and the last submitted
 * username and email, the fields' defaults, so React's reset after a refusal restores them. The
 * password is never kept (N30), so that reset clears it. Addendum v3b adds two rule booleans and
 * the submit block, never a typed value (N33).
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, IDLE);
  const [kept, setKept] = useState(EMPTY);
  const [rules, setRules] = useState(UNMET);
  const [block, setBlock] = useState<SignUpSubmitBlock>('none');
  // A blocked submit hides the last answer (and its field marks) until the next one: it is stale.
  const [answerDismissed, setAnswerDismissed] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    setAnswerDismissed(false);
    // The action answered: React's form reset empties the password without an input event.
    if (!pending) setRules(UNMET);
  }
  useEffect(emptySignInPassword, []);
  // clearOnHide empties both password inputs when <Activity> hides the route or a Suspense boundary
  // shows its fallback again, with no input event; a layout cleanup runs in both cases.
  useLayoutEffect(
    () => () => {
      setRules(UNMET);
      setBlock('none');
    },
    [],
  );
  return (
    <SignUpFormView
      state={answerDismissed ? IDLE : state}
      pending={pending}
      kept={kept}
      rules={rules}
      block={block}
      onFieldsSubmit={setKept}
      onRulesChange={(next) =>
        setRules((current) => (sameRules(current, next) ? current : next))
      }
      onBlockChange={(next) => {
        setBlock(next);
        if (next !== 'none') setAnswerDismissed(true);
      }}
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
