import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignUpFormState } from './sign-up-form-state';
import { SignUpFormView } from './sign-up-form-view';

const KEPT = { username: 'kaito_tanaka', email: 'kaito@example.com' };

const view = (state: SignUpFormState, pending = false, kept = KEPT) => (
  <SignUpFormView
    state={state}
    pending={pending}
    kept={kept}
    onFieldsSubmit={vi.fn()}
    formAction={vi.fn()}
  />
);

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const fields = () => ['Username', 'Email', 'Password'].map(input);

describe('SignUpFormView', () => {
  afterEach(cleanup);

  it('shows no alert before the first submit', () => {
    render(view({ kind: 'idle' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByText(/At least 8 characters/).id).toBe(
      input('Password').getAttribute('aria-describedby'),
    );
  });

  it.each<[SignUpFormState, RegExp]>([
    [
      { kind: 'invalid_fields', fields: ['username', 'email', 'password'] },
      /another look.*3 to 20 letters.*valid email.*common ones are refused/,
    ],
    [
      { kind: 'username_taken' },
      /username is taken.*email we sent still works/,
    ],
    [{ kind: 'sign_up_closed' }, /aren't open yet.*Sign in below/],
    [
      { kind: 'rate_limited', retryAfterSeconds: 120 },
      /Slow down.*Try again in 2 minutes\./,
    ],
    [{ kind: 'busy' }, /Sign-up is busy.*Wait a moment/],
    [{ kind: 'unavailable' }, /couldn't confirm.*its link still works/],
    [{ kind: 'off_on_preview' }, /off on preview deployments.*live site/],
  ])('announces %o with its own copy', (state, copy) => {
    render(view(state));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(copy);
    expect(alert.textContent).not.toMatch(/nothing was saved/i);
    expect(alert.textContent).not.toContain(KEPT.username);
    expect(alert.textContent).not.toContain(KEPT.email);
  });

  it('marks only the named fields invalid, described by the alert', () => {
    render(view({ kind: 'invalid_fields', fields: ['email', 'password'] }));
    const alertId = screen.getByRole('alert').id;
    const [username, email, password] = fields();
    expect(username?.hasAttribute('aria-invalid')).toBe(false);
    expect(username?.hasAttribute('aria-describedby')).toBe(false);
    for (const field of [email, password]) {
      expect(field?.getAttribute('aria-invalid')).toBe('true');
      expect(field?.getAttribute('aria-describedby')).toContain(alertId);
    }
    expect(screen.getByRole('alert').textContent).not.toMatch(/3 to 20/);
  });

  it('marks only the username when it is taken, and nothing otherwise', () => {
    render(view({ kind: 'username_taken' }));
    expect(fields().map((field) => field.getAttribute('aria-invalid'))).toEqual(
      ['true', null, null],
    );
    cleanup();
    render(view({ kind: 'busy' }));
    expect(fields().some((field) => field.hasAttribute('aria-invalid'))).toBe(
      false,
    );
  });

  it('locks the form while pending, hides the alert and cancels a second submit', () => {
    const { rerender } = render(view({ kind: 'username_taken' }));
    const first = screen.getByRole('alert');
    rerender(view({ kind: 'username_taken' }, true));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(input('Username').hasAttribute('aria-invalid')).toBe(false);
    const button = screen.getByRole('button', { name: /Creating account/ });
    expect(button.closest('form')?.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(fields().every((field) => field.readOnly)).toBe(true);
    const form = button.closest('form') as HTMLFormElement;
    expect(fireEvent.submit(form)).toBe(false);

    rerender(view({ kind: 'username_taken' }));
    expect(screen.getByRole('alert')).not.toBe(first);
  });

  it('names, limits and autocompletes the fields, keeping username and email only', () => {
    render(view({ kind: 'idle' }));
    expect(input('Username')).toMatchObject({
      id: 'sign-up-username',
      name: 'username',
      autocomplete: 'username',
      required: true,
      value: KEPT.username,
    });
    expect(
      ['autocapitalize', 'autocorrect', 'spellcheck'].map((name) =>
        input('Username').getAttribute(name),
      ),
    ).toEqual(['none', 'off', 'false']);
    expect(input('Email')).toMatchObject({
      id: 'sign-up-email',
      type: 'email',
      maxLength: 254,
      required: true,
      value: KEPT.email,
    });
    expect(input('Password')).toMatchObject({
      id: 'sign-up-password',
      type: 'password',
      autocomplete: 'new-password',
      maxLength: 1024,
      required: true,
      value: '',
      defaultValue: '',
    });
  });

  it('keeps a very long email in its field', () => {
    const email = `${'a'.repeat(240)}@example.com`;
    render(view({ kind: 'idle' }, false, { username: 'k', email }));
    expect(input('Email').value).toBe(email);
  });

  it('reports the submitted username and email, never the password', () => {
    const onFieldsSubmit = vi.fn();
    render(
      <SignUpFormView
        state={{ kind: 'idle' }}
        pending={false}
        kept={{ username: '', email: '' }}
        onFieldsSubmit={onFieldsSubmit}
        formAction={vi.fn()}
      />,
    );
    fireEvent.change(input('Username'), { target: { value: 'mio' } });
    fireEvent.change(input('Email'), { target: { value: 'mio@example.com' } });
    fireEvent.change(input('Password'), { target: { value: 'secret-1' } });
    fireEvent.submit(input('Username').closest('form') as HTMLFormElement);
    expect(onFieldsSubmit).toHaveBeenCalledWith({
      username: 'mio',
      email: 'mio@example.com',
    });
  });
});
