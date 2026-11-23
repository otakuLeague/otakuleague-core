import type { FormEvent } from 'react';
import type {
  ConfirmEmailFailureState,
  ConfirmEmailFormState,
} from './confirm-email-form-state';
import { PasswordInput } from './password-input';
import { retryWaitCopy } from './sign-in-form-view';

type ConfirmEmailFormViewProps = {
  readonly state: ConfirmEmailFormState;
  readonly pending: boolean;
  readonly formAction: (formData: FormData) => void;
};

type AlertCopy = {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'bad' | 'wait' | 'info';
};

const ALERT_ID = 'confirm-email-alert';
const PASSWORD_ID = 'confirm-email-password';

function alertCopy(state: ConfirmEmailFailureState): AlertCopy {
  switch (state.kind) {
    case 'wrong_password':
      return {
        title: "That password didn't match.",
        detail: 'Enter the password you chose when you signed up.',
        tone: 'bad',
      };
    case 'rate_limited':
      return {
        title: 'Too many attempts.',
        detail: `For your safety, confirming is paused. Wait, then open the link in your email again ${retryWaitCopy(state.retryAfterSeconds)}.`,
        tone: 'wait',
      };
    case 'busy':
      return {
        title: "We're busy.",
        detail: 'Wait a moment, then try again.',
        tone: 'wait',
      };
    case 'unavailable':
      return {
        title: "We couldn't confirm your email right now.",
        detail:
          'Something went wrong on our side. Try again in a little while.',
        tone: 'bad',
      };
    case 'off_on_preview':
      return {
        title: 'Email confirmation is off on preview deployments',
        detail: 'Use the live site to confirm your email.',
        tone: 'info',
      };
  }
}

/**
 * The password page's form (ADR 0015 Addendum 1f-vi decision 9): one uncontrolled password field,
 * never kept in state, so React's reset after a failure empties it. The alert is hidden while
 * pending, so a repeated failure is announced again; a second submit while pending is cancelled.
 */
export function ConfirmEmailFormView({
  state,
  pending,
  formAction,
}: ConfirmEmailFormViewProps) {
  const copy = state.kind === 'idle' || pending ? null : alertCopy(state);
  const invalid = !pending && state.kind === 'wrong_password';
  return (
    <form
      className="au-card"
      action={formAction}
      aria-busy={pending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (pending) {
          event.preventDefault();
        }
      }}
    >
      {copy && (
        <div
          className="au-alert"
          data-tone={copy.tone}
          role="alert"
          id={ALERT_ID}
        >
          <strong>{copy.title}</strong>
          <span>{copy.detail}</span>
        </div>
      )}
      <div className="au-field">
        <label htmlFor={PASSWORD_ID}>Password</label>
        <PasswordInput
          id={PASSWORD_ID}
          name="password"
          autoComplete="current-password"
          fieldName="password"
          pending={pending}
          invalid={invalid}
          describedBy={invalid ? ALERT_ID : undefined}
        />
      </div>
      <button className="ol-btn ol-btn--primary au-btn" aria-disabled={pending}>
        {pending && <span className="au-spin" aria-hidden="true" />}
        {pending ? 'Confirming…' : 'Confirm my email'}
      </button>
    </form>
  );
}
