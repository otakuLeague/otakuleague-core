import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignInFormState } from './sign-in-form-state';
import {
  PreviewOffNotice,
  retryWaitCopy,
  SignInFormView,
} from './sign-in-form-view';

const view = (state: SignInFormState, pending = false) => (
  <SignInFormView
    state={state}
    pending={pending}
    identifier="kaito"
    onIdentifierSubmit={vi.fn()}
    formAction={vi.fn()}
  >
    <input type="hidden" name="next" value="/season" />
  </SignInFormView>
);

function renderForm(state: SignInFormState, pending = false) {
  return render(view(state, pending));
}

const identifierInput = () => screen.getByLabelText('Email or username');
const passwordInput = () => screen.getByLabelText<HTMLInputElement>('Password');

describe('SignInFormView', () => {
  afterEach(cleanup);

  it('shows no alert before the first submit', () => {
    renderForm({ kind: 'idle' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it.each<[SignInFormState, RegExp]>([
    [
      { kind: 'invalid_credentials' },
      /didn't match.*email or username and password/i,
    ],
    [
      { kind: 'rate_limited', retryAfterSeconds: 61 },
      /Too many attempts.*in 2 minutes/,
    ],
    [{ kind: 'rate_limited', retryAfterSeconds: null }, /in a few minutes/],
    [{ kind: 'busy' }, /Sign-in is busy/],
    [{ kind: 'unavailable' }, /isn't available right now/],
    [{ kind: 'off_on_preview' }, /Sign-in is off on preview deployments/],
  ])('announces %o with its own copy', (state, copy) => {
    renderForm(state);
    expect(screen.getByRole('alert').textContent).toMatch(copy);
  });

  it.each([
    [59, 'in 1 minute'],
    [60, 'in 1 minute'],
    [61, 'in 2 minutes'],
    [0, 'in 1 minute'],
    [3600, 'in 60 minutes'],
    [3601, 'in 2 hours'],
    [86_400, 'in 24 hours'],
    [null, 'in a few minutes'],
  ])('rounds Retry-After %s seconds up to "%s"', (seconds, copy) => {
    expect(retryWaitCopy(seconds)).toBe(copy);
  });

  it('pending hides the previous alert, so the same failure is announced again', () => {
    const { rerender } = renderForm({ kind: 'invalid_credentials' });
    const first = screen.getByRole('alert');

    rerender(
      <SignInFormView
        state={{ kind: 'invalid_credentials' }}
        pending
        identifier="kaito"
        onIdentifierSubmit={vi.fn()}
        formAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(identifierInput().hasAttribute('aria-describedby')).toBe(false);
    rerender(
      <SignInFormView
        state={{ kind: 'invalid_credentials' }}
        pending={false}
        identifier="kaito"
        onIdentifierSubmit={vi.fn()}
        formAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).not.toBe(first);
  });

  it('marks both fields invalid only for wrong credentials', () => {
    renderForm({ kind: 'invalid_credentials' });
    const alertId = screen.getByRole('alert').id;
    for (const input of [identifierInput(), passwordInput()]) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(alertId);
    }
    cleanup();
    renderForm({ kind: 'busy' });
    expect(identifierInput().hasAttribute('aria-invalid')).toBe(false);
    expect(passwordInput().hasAttribute('aria-describedby')).toBe(false);
  });

  it('locks the form while pending without disabling the button', () => {
    renderForm({ kind: 'idle' }, true);
    const button = screen.getByRole('button', { name: /Signing in/ });
    expect(button.closest('form')?.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(identifierInput().hasAttribute('readonly')).toBe(true);
    expect(passwordInput().hasAttribute('readonly')).toBe(true);
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show.getAttribute('aria-disabled')).toBe('true');
    expect(show.hasAttribute('disabled')).toBe(false);
  });

  it('keeps a typed password when it re-renders as pending', () => {
    const { rerender } = renderForm({ kind: 'idle' });
    const password = passwordInput();
    fireEvent.change(password, { target: { value: 'secret-pass-1' } });

    rerender(view({ kind: 'idle' }, true));
    expect(password.value).toBe('secret-pass-1');
    expect(passwordInput()).toBe(password);
  });

  it('empties a typed password when the form is hidden in an Activity', () => {
    const inActivity = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>{view({ kind: 'idle' })}</Activity>
    );
    const { rerender } = render(inActivity('visible'));
    const password = passwordInput();
    fireEvent.change(password, { target: { value: 'secret-pass-1' } });
    fireEvent.change(identifierInput(), { target: { value: 'mio' } });

    rerender(inActivity('hidden'));
    expect(password.value).toBe('');
    expect(
      document.querySelector<HTMLInputElement>('#sign-in-identifier')?.value,
    ).toBe('mio');

    // Revealed again, the ref is re-attached, so a second hide still clears.
    rerender(inActivity('visible'));
    fireEvent.change(password, { target: { value: 'secret-pass-2' } });
    rerender(inActivity('hidden'));
    expect(password.value).toBe('');
  });

  it('names, limits and autocompletes both fields and keeps children in the form', () => {
    const { container } = renderForm({ kind: 'idle' });
    expect(identifierInput()).toMatchObject({
      name: 'identifier',
      autocomplete: 'username',
      maxLength: 254,
      required: true,
      value: 'kaito',
    });
    expect(
      ['autocapitalize', 'autocorrect', 'spellcheck'].map((name) =>
        identifierInput().getAttribute(name),
      ),
    ).toEqual(['none', 'off', 'false']);
    expect(passwordInput()).toMatchObject({
      name: 'password',
      type: 'password',
      autocomplete: 'current-password',
      maxLength: 1024,
      required: true,
    });
    expect(passwordInput().getAttribute('autocapitalize')).toBe('none');
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show.getAttribute('aria-controls')).toBe(passwordInput().id);
    fireEvent.click(show);
    expect([passwordInput().type, show.textContent]).toEqual([
      'text',
      'Hide password',
    ]);
    expect(container.querySelector('form input[name="next"]')).not.toBeNull();
  });

  it('keeps a very long identifier in the field', () => {
    render(
      <SignInFormView
        state={{ kind: 'idle' }}
        pending={false}
        identifier={'a'.repeat(254)}
        onIdentifierSubmit={vi.fn()}
        formAction={vi.fn()}
      />,
    );
    expect((identifierInput() as HTMLInputElement).value).toHaveLength(254);
  });
});

describe('static notes', () => {
  afterEach(cleanup);

  it('renders the preview notice without an alert role', () => {
    render(<PreviewOffNotice />);
    expect(
      screen.getByText('Sign-in is off on preview deployments'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
