import type { FormEvent, ReactNode } from 'react';
import {
  SIGN_IN_IDENTIFIER_MAX,
  SIGN_IN_PASSWORD_RAW_MAX,
  type SignInFailureState,
  type SignInFormState,
} from './sign-in-form-state';

type SignInFormViewProps = {
  readonly state: SignInFormState;
  readonly pending: boolean;
  readonly identifier: string;
  readonly onIdentifierChange: (value: string) => void;
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

/** Retry-After in whole minutes, never less than one (ADR 0020: copy per route, never the API's). */
export function retryMinutesCopy(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return 'in a few minutes';
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
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
        detail: `For your safety, sign-in is paused. Try again ${retryMinutesCopy(state.retryAfterSeconds)}.`,
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

function blockSubmit(event: FormEvent<HTMLFormElement>): void {
  event.preventDefault();
}

export function SignInFormView({
  state,
  pending,
  identifier,
  onIdentifierChange,
  formAction,
  children,
}: SignInFormViewProps) {
  const copy = state.kind === 'idle' ? null : alertCopy(state);
  const invalid = state.kind === 'invalid_credentials';
  const fieldError = invalid
    ? ({ 'aria-invalid': true, 'aria-describedby': ALERT_ID } as const)
    : {};
  const inputState = invalid ? 'error' : undefined;
  return (
    <form
      className="au-card"
      action={formAction}
      aria-busy={pending}
      onSubmit={pending ? blockSubmit : undefined}
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
            maxLength={SIGN_IN_IDENTIFIER_MAX}
            required
            readOnly={pending}
            value={identifier}
            onChange={(event) => onIdentifierChange(event.target.value)}
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
            maxLength={SIGN_IN_PASSWORD_RAW_MAX}
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

export function SignUpClosedNote() {
  return (
    <p className="au-sub">
      New accounts aren&apos;t open yet. Already have one? Sign in below.
    </p>
  );
}
