'use client';

import { PASSWORD_RAW_MAX } from '@otakuleague/shared-types';
import { type ChangeEventHandler, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { clearOnHide } from './clear-on-hide';

type PasswordInputProps = {
  readonly id: string;
  /** Only posted fields: the sign-up confirmation has no name, so it is never sent. */
  readonly name?: 'password';
  readonly autoComplete: 'current-password' | 'new-password';
  /** Hidden text after "Show" or "Hide", so each button has its own name. */
  readonly fieldName: 'password' | 'confirmation';
  readonly pending: boolean;
  readonly invalid: boolean;
  readonly describedBy?: string;
  /** Gets the event, never a value: the handler passes up only what it computes (N33). */
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
};

/**
 * What the three password fields share (ADR 0015 Addendum v3b decision 5): uncontrolled, emptied on
 * hide, no correction, read-only while pending, and a Show button whose `revealed` boolean is the
 * only state. The field is `type="text"` only when revealed and not pending. A submit hides it
 * first, synchronously and before the form's own handlers (the gate, the action), so a browser
 * never sees a submitted password in a text field (OTA-139 v3b-b: stricter than the addendum).
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  fieldName,
  pending,
  invalid,
  describedBy,
  onChange,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const shown = revealed && !pending;
  useEffect(() => {
    const form = button.current?.form;
    if (!revealed || !form) {
      return undefined;
    }
    // Listeners on the form run before React's, which are delegated to the root.
    const conceal = () => flushSync(() => setRevealed(false));
    form.addEventListener('submit', conceal);
    return () => form.removeEventListener('submit', conceal);
  }, [revealed]);
  return (
    <div className="au-input" data-state={invalid ? 'error' : undefined}>
      <input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PASSWORD_RAW_MAX}
        required
        readOnly={pending}
        ref={clearOnHide}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={onChange}
      />
      {/* No aria-pressed: with a name that changes it would read "Hide, pressed". */}
      <button
        ref={button}
        className="au-reveal"
        type="button"
        aria-controls={id}
        aria-disabled={pending}
        onClick={() => {
          if (!pending) setRevealed(!revealed);
        }}
      >
        {shown ? 'Hide' : 'Show'} <span className="au-sr">{fieldName}</span>
      </button>
    </div>
  );
}
