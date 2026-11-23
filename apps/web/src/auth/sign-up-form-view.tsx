import {
  IDENTIFIER_MAX,
  PASSWORD_MIN,
  type SignUpPasswordRules,
  signUpPasswordRules,
} from '@otakuleague/shared-types';
import type { FormEvent } from 'react';
import { PasswordInput } from './password-input';
import { retryWaitCopy } from './sign-in-form-view';
import {
  type SignUpSubmitBlock,
  signUpSubmitBlock,
} from './sign-up-password-checks';
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
  readonly rules: SignUpPasswordRules;
  readonly block: SignUpSubmitBlock;
  readonly onFieldsSubmit: (kept: SignUpKeptFields) => void;
  /** Booleans only: nothing typed leaves a handler (ADR 0015 Addendum v3b, N33). */
  readonly onRulesChange: (rules: SignUpPasswordRules) => void;
  readonly onBlockChange: (block: SignUpSubmitBlock) => void;
  readonly formAction: (formData: FormData) => void;
};

type AlertCopy = {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'bad' | 'wait' | 'info';
  readonly invalid?: readonly SignUpField[];
};

const ALERT_ID = 'sign-up-alert';
const PASSWORD_ID = 'sign-up-password';
const CONFIRM_ID = 'sign-up-confirm';
const RULE_LENGTH_ID = 'sign-up-rule-length';
const RULE_SYMBOL_ID = 'sign-up-rule-symbol';

const FIELD_COPY: Readonly<Record<SignUpField, string>> = {
  username: 'Usernames are 3 to 20 letters, numbers or underscores.',
  email: 'Enter a valid email address.',
  password: `Passwords need ${PASSWORD_MIN} to 128 characters with a number or symbol, and common ones are refused.`,
};

type BlockKind = Exclude<SignUpSubmitBlock, 'none'>;

/** ADR 0015 Addendum v3b decision 4: the field a block stops on, and what it says under it. */
const BLOCK_COPY: Readonly<
  Record<BlockKind, { readonly id: string; readonly message: string }>
> = {
  rules_unmet: {
    id: PASSWORD_ID,
    message: `Passwords need at least ${PASSWORD_MIN} characters and a number or symbol.`,
  },
  confirm_mismatch: { id: CONFIRM_ID, message: "Passwords don't match." },
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

function keptFrom(form: HTMLFormElement): SignUpKeptFields {
  const formData = new FormData(form);
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  return { username: read('username'), email: read('email') };
}

/** By id; anything but one input reads as empty, so a missing field blocks the submit. */
function inputOf(form: HTMLFormElement, id: string): HTMLInputElement | null {
  const element = form.elements.namedItem(id);
  return element instanceof HTMLInputElement ? element : null;
}

/** Under its field; an edit removes it, so the next blocked submit inserts and announces it again. */
function BlockMessage({ block }: { readonly block: BlockKind }) {
  const { id, message } = BLOCK_COPY[block];
  return (
    <p className="au-msg" data-tone="bad" role="alert" id={`${id}-error`}>
      {message}
    </p>
  );
}

function PasswordRule({
  id,
  met,
  label,
}: {
  readonly id: string;
  readonly met: boolean;
  readonly label: string;
}) {
  return (
    <li id={id} data-met={met ? '' : undefined}>
      {label}
      <span className="au-sr">{met ? ': done.' : ': not met.'}</span>
    </li>
  );
}

/**
 * Pure sign-up form: four uncontrolled fields (the confirmation has no name, so it is never
 * posted), one alert, one submit in flight (N29), and the browser's password gate (N32).
 */
export function SignUpFormView({
  state,
  pending,
  kept,
  rules,
  block,
  onFieldsSubmit,
  onRulesChange,
  onBlockChange,
  formAction,
}: SignUpFormViewProps) {
  // Hidden while pending, so a repeated refusal inserts a new alert node and is announced again.
  const copy = state.kind === 'idle' || pending ? null : alertCopy(state);
  const isInvalid = (field: SignUpField) =>
    copy?.invalid?.includes(field) === true;
  const fieldProps = (field: SignUpField) =>
    isInvalid(field)
      ? ({ 'aria-invalid': true, 'aria-describedby': ALERT_ID } as const)
      : {};
  const inputState = (field: SignUpField) =>
    isInvalid(field) ? 'error' : undefined;
  const passwordBlocked = block === 'rules_unmet';
  const passwordInvalid = isInvalid('password') || passwordBlocked;
  const confirmBlocked = block === 'confirm_mismatch';
  const passwordDescribedBy = [
    isInvalid('password') && ALERT_ID,
    passwordBlocked && `${PASSWORD_ID}-error`,
    RULE_LENGTH_ID,
    RULE_SYMBOL_ID,
  ]
    .filter(Boolean)
    .join(' ');
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
        const form = event.currentTarget;
        const next = signUpSubmitBlock(
          inputOf(form, PASSWORD_ID)?.value ?? '',
          inputOf(form, CONFIRM_ID)?.value ?? '',
        );
        onBlockChange(next);
        if (next !== 'none') {
          event.preventDefault();
          inputOf(form, BLOCK_COPY[next].id)?.focus();
          return;
        }
        onFieldsSubmit(keptFrom(form));
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
        <label htmlFor={PASSWORD_ID}>Password</label>
        <PasswordInput
          id={PASSWORD_ID}
          name="password"
          autoComplete="new-password"
          fieldName="password"
          pending={pending}
          invalid={passwordInvalid}
          describedBy={passwordDescribedBy}
          onChange={(event) => {
            onRulesChange(signUpPasswordRules(event.currentTarget.value));
            onBlockChange('none');
          }}
        />
        {passwordBlocked && <BlockMessage block="rules_unmet" />}
        {/* The items describe the password, not the list: its aria-label would replace their text. */}
        {/* role="list": Safari drops list semantics under list-style: none. */}
        <ul className="au-rules" role="list" aria-label="Password rules">
          <PasswordRule
            id={RULE_LENGTH_ID}
            met={rules.longEnough}
            label={`At least ${PASSWORD_MIN} characters`}
          />
          <PasswordRule
            id={RULE_SYMBOL_ID}
            met={rules.hasDigitOrSymbol}
            label="A number or symbol"
          />
        </ul>
      </div>
      <div className="au-field">
        <label htmlFor={CONFIRM_ID}>Confirm password</label>
        <PasswordInput
          id={CONFIRM_ID}
          autoComplete="new-password"
          fieldName="confirmation"
          pending={pending}
          invalid={confirmBlocked}
          describedBy={confirmBlocked ? `${CONFIRM_ID}-error` : undefined}
          onChange={() => onBlockChange('none')}
        />
        {confirmBlocked && <BlockMessage block="confirm_mismatch" />}
      </div>
      <button className="ol-btn ol-btn--primary au-btn" aria-disabled={pending}>
        {pending && <span className="au-spin" aria-hidden="true" />}
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
