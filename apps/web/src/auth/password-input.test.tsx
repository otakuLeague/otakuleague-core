import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordInput } from './password-input';

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;
const cancel: SubmitHandler = (event) => event.preventDefault();

const field = (pending: boolean, onSubmit = cancel, invalid = false) => (
  <form onSubmit={onSubmit}>
    <label htmlFor="pw">Password</label>
    <PasswordInput
      id="pw"
      name="password"
      autoComplete="new-password"
      fieldName="password"
      pending={pending}
      invalid={invalid}
      describedBy={invalid ? 'pw-error' : undefined}
    />
  </form>
);
const input = () => screen.getByLabelText<HTMLInputElement>('Password');
const reveal = () => screen.getByRole('button', { name: /password$/ });

describe('PasswordInput', () => {
  afterEach(cleanup);

  it('starts hidden, toggles Show and Hide, and keeps what was typed out of props (N33)', () => {
    render(field(false));
    expect([input().type, reveal().textContent]).toEqual([
      'password',
      'Show password',
    ]);
    expect(reveal()).toMatchObject({ type: 'button', className: 'au-reveal' });
    expect(reveal().getAttribute('aria-controls')).toBe('pw');
    expect(reveal().hasAttribute('aria-pressed')).toBe(false);
    fireEvent.change(input(), { target: { value: 'secret-pass-1' } });

    fireEvent.click(reveal());
    expect([input().type, reveal().textContent]).toEqual([
      'text',
      'Hide password',
    ]);
    fireEvent.click(reveal());
    expect(input().type).toBe('password');
    expect(input().value).toBe('secret-pass-1');
    expect([input().defaultValue, input().getAttribute('value')]).toEqual([
      '',
      null,
    ]);
  });

  it('is a read-only password field with an aria-disabled button while pending', () => {
    const { rerender } = render(field(false));
    fireEvent.click(reveal());
    rerender(field(true));
    expect([input().type, input().readOnly]).toEqual(['password', true]);
    expect(reveal().getAttribute('aria-disabled')).toBe('true');
    expect(reveal().hasAttribute('disabled')).toBe(false);
    fireEvent.click(reveal());

    rerender(field(false));
    expect([input().type, input().readOnly]).toEqual(['text', false]);
  });

  it('hides a revealed field before the form handlers run, so the gate sees a password field', () => {
    const typesAtSubmit: string[] = [];
    render(
      field(false, (event) => {
        cancel(event);
        typesAtSubmit.push(input().type);
      }),
    );
    fireEvent.click(reveal());
    fireEvent.submit(input().form as HTMLFormElement);
    expect(typesAtSubmit).toEqual(['password']);
    expect(reveal().textContent).toBe('Show password');
  });

  it('shares limits and input hints, and marks itself invalid when told', () => {
    const { container } = render(field(false, cancel, true));
    expect(input()).toMatchObject({
      name: 'password',
      autocomplete: 'new-password',
      maxLength: 1024,
      required: true,
    });
    expect(
      ['autocapitalize', 'autocorrect', 'spellcheck'].map((name) =>
        input().getAttribute(name),
      ),
    ).toEqual(['none', 'off', 'false']);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe('pw-error');
    expect(
      container.querySelector('.au-input')?.getAttribute('data-state'),
    ).toBe('error');
  });
});
