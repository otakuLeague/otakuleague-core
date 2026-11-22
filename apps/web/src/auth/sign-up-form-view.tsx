import { IDENTIFIER_MAX, PASSWORD_RAW_MAX } from '@otakuleague/shared-types';
import type { FormEvent } from 'react';
import { retryWaitCopy } from './sign-in-form-view';
import type {
  SignUpFailureState,
  SignUpField,
  SignUpFormState,
} from './sign-up-form-state';

/** The last submitted username and email: the fields' defaults, so React's reset keeps them. */
export type SignUpKeptFields = {
  readonly username: string;
  readonly email: string;
};

type SignUpFormViewProps = {
  readonly state: SignUpFormState;
  readonly pending: boolean;
  readonly kept: SignUpKeptFields;
  readonly onFieldsSubmit: (kept: SignUpKeptFields) => void;
  readonly formAction: (formData: FormData) => void;
};

type AlertCopy = {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'bad' | 'wait' | 'info';
  readonly invalid?: readonly SignUpField[];
};

const ALERT_ID = 'sign-up-alert';
const HINT_ID = 'sign-up-password-hint';

const FIELD_COPY: Readonly<Record<SignUpField, string>> = {
  username: 'Usernames are 3 to 20 letters, numbers or underscores.',
  email: 'Enter a valid email address.',
  password:
    'Passwords need 8 to 128 characters with a number or symbol, and common ones are refused.',
};

type FixedKind = Exclude<
  SignUpFailureState['kind'],
  'invalid_fields' | 'rate_limited'
>;

const FIXED_COPY: Readonly<Record<FixedKind, AlertCopy>> = {
  username_taken: {
    title: 'That username is taken.',
    detail:
      'Pick another one. If you already signed up with it, the confirmation email we sent still works.',
    tone: 'bad',
    invalid: ['username'],
  },
  sign_up_closed: {
    title: "New accounts aren't open yet.",
    detail: 'Already have one? Sign in below.',
    tone: 'info',
  },
  busy: {
    title: 'Sign-up is busy.',
    detail: 'Wait a moment, then try again.',
    tone: 'wait',
  },
  unavailable: {
    title: "We couldn't confirm your sign-up.",
    detail:
      'Something went wrong on our side. If a confirmation email arrives, its link still works. Otherwise try again in a little while.',
    tone: 'bad',
  },
  off_on_preview: {
    title: 'Sign-up is off on preview deployments',
    detail: 'Use the live site to sign up.',
    tone: 'info',
  },
};

/** ADR 0015 Addendum 1f-v3 decision 4: copy per state, never what was typed or the API's message. */
function alertCopy(state: SignUpFailureState): AlertCopy {
  switch (state.kind) {
    case 'invalid_fields':
      return {
        title: 'Some details need another look.',
        detail: state.fields.map((field) => FIELD_COPY[field]).join(' '),
        tone: 'bad',
        invalid: state.fields,
      };
    case 'rate_limited':
      return {
        title: 'Slow down a little.',
        detail: `Too many sign-ups from this network. Try again ${retryWaitCopy(state.retryAfterSeconds)}.`,
        tone: 'wait',
      };
    default:
      return FIXED_COPY[state.kind];
  }
}

/**
 * Empties the password when the input leaves the screen: `cacheComponents` keeps a left route in a
 * hidden `<Activity>`, which detaches refs but keeps the DOM, so a typed password would stay there.
 */
const clearOnHide = (input: HTMLInputElement) => () => {
  input.value = '';
};

function keptFrom(form: HTMLFormElement): SignUpKeptFields {
  const formData = new FormData(form);
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  return { username: read('username'), email: read('email') };
}

/** Pure sign-up form: three uncontrolled fields, one alert, one submit in flight (N29). */
export function SignUpFormView({
  state,
  pending,
  kept,
  onFieldsSubmit,
  formAction,
}: SignUpFormViewProps) {
  // Hidden while pending, so a repeated refusal inserts a new alert node and is announced again.
  const copy = state.kind === 'idle' || pending ? null : alertCopy(state);
  const isInvalid = (field: SignUpField) =>
    copy?.invalid?.includes(field) === true;
  const fieldProps = (field: SignUpField, describedBy = ALERT_ID) =>
    isInvalid(field)
      ? ({ 'aria-invalid': true, 'aria-describedby': describedBy } as const)
      : {};
  const inputState = (field: SignUpField) =>
    isInvalid(field) ? 'error' : undefined;
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
        onFieldsSubmit(keptFrom(event.currentTarget));
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
        <label htmlFor="sign-up-username">Username</label>
        <div className="au-input" data-state={inputState('username')}>
          <input
            id="sign-up-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            readOnly={pending}
            defaultValue={kept.username}
            {...fieldProps('username')}
          />
        </div>
      </div>
      <div className="au-field">
        <label htmlFor="sign-up-email">Email</label>
        <div className="au-input" data-state={inputState('email')}>
          <input
            id="sign-up-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={IDENTIFIER_MAX}
            required
            readOnly={pending}
            defaultValue={kept.email}
            {...fieldProps('email')}
          />
        </div>
      </div>
      <div className="au-field">
        <label htmlFor="sign-up-password">Password</label>
        <div className="au-input" data-state={inputState('password')}>
          <input
            id="sign-up-password"
            name="password"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PASSWORD_RAW_MAX}
            required
            readOnly={pending}
            ref={clearOnHide}
            aria-describedby={HINT_ID}
            {...fieldProps('password', `${ALERT_ID} ${HINT_ID}`)}
          />
        </div>
        <p className="au-field-hint" id={HINT_ID}>
          8 to 128 characters, with a number or symbol.
        </p>
      </div>
      <button className="ol-btn ol-btn--primary au-btn" aria-disabled={pending}>
        {pending && <span className="au-spin" aria-hidden="true" />}
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
