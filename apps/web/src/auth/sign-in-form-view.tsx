import { IDENTIFIER_MAX, PASSWORD_RAW_MAX } from '@otakuleague/shared-types';
import type { FormEvent, ReactNode } from 'react';
import type { SignInFailureState, SignInFormState } from './sign-in-form-state';

type SignInFormViewProps = {
  readonly state: SignInFormState;
  readonly pending: boolean;
  /** The last submitted identifier: the field's default, so React's reset after a failure keeps it. */
  readonly identifier: string;
  readonly onIdentifierSubmit: (value: string) => void;
  readonly formAction: (formData: FormData) => void;
  readonly children?: ReactNode;
};

type AlertCopy = {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'bad' | 'wait' | 'info';
};

const PREVIEW_OFF_TITLE = 'Sign-in is off on preview deployments';
const PREVIEW_OFF_DETAIL = 'Use the live site to sign in.';
const ALERT_ID = 'sign-in-alert';

/**
 * Retry-After rounded up to whole minutes (at least one), or to whole hours past 60 minutes
 * (ADR 0020: copy per route, never the API's).
 */
export function retryWaitCopy(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return 'in a few minutes';
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  if (minutes > 60) {
    const hours = Math.ceil(minutes / 60);
    return `in ${hours} hours`;
  }
  return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function alertCopy(state: SignInFailureState): AlertCopy {
  switch (state.kind) {
    case 'invalid_credentials':
      return {
        title: "That didn't match.",
        detail:
          'Check your email or username and password, then try again. New accounts need a confirmed email first.',
        tone: 'bad',
      };
    case 'rate_limited':
      return {
        title: 'Too many attempts.',
        detail: `For your safety, sign-in is paused. Try again ${retryWaitCopy(state.retryAfterSeconds)}.`,
        tone: 'wait',
      };
    case 'busy':
      return {
        title: 'Sign-in is busy.',
        detail: 'Wait a moment, then try again.',
        tone: 'wait',
      };
    case 'unavailable':
      return {
        title: "Sign-in isn't available right now.",
        detail:
          'Something went wrong on our side. Try again in a little while.',
        tone: 'bad',
      };
    case 'off_on_preview':
      return {
        title: PREVIEW_OFF_TITLE,
        detail: PREVIEW_OFF_DETAIL,
        tone: 'info',
      };
  }
}

export function SignInFormView({
  state,
  pending,
  identifier,
  onIdentifierSubmit,
  formAction,
  children,
}: SignInFormViewProps) {
  // Hidden while pending, so a repeated failure inserts a new alert node and is announced again.
  const copy = state.kind === 'idle' || pending ? null : alertCopy(state);
  const invalid = !pending && state.kind === 'invalid_credentials';
  const fieldError = invalid
    ? ({ 'aria-invalid': true, 'aria-describedby': ALERT_ID } as const)
    : {};
  const inputState = invalid ? 'error' : undefined;
  return (
    <form
      className="au-card"
      action={formAction}
      aria-busy={pending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        const submitted = new FormData(event.currentTarget).get('identifier');
        if (typeof submitted === 'string') {
          onIdentifierSubmit(submitted);
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
        <label htmlFor="sign-in-identifier">Email or username</label>
        <div className="au-input" data-state={inputState}>
          <input
            id="sign-in-identifier"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={IDENTIFIER_MAX}
            required
            readOnly={pending}
            defaultValue={identifier}
            {...fieldError}
          />
        </div>
      </div>
      <div className="au-field">
        <label htmlFor="sign-in-password">Password</label>
        <div className="au-input" data-state={inputState}>
          <input
            id="sign-in-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={PASSWORD_RAW_MAX}
            required
            readOnly={pending}
            {...fieldError}
          />
        </div>
      </div>
      {children}
      <button className="ol-btn ol-btn--primary au-btn" aria-disabled={pending}>
        {pending && <span className="au-spin" aria-hidden="true" />}
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function PreviewOffNotice() {
  return (
    <div className="au-alert" data-tone="info">
      <strong>{PREVIEW_OFF_TITLE}</strong>
      <span>{PREVIEW_OFF_DETAIL}</span>
    </div>
  );
}
