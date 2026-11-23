import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { confirmEmailAction } from './confirm-email-action';
import { ConfirmEmailForm } from './confirm-email-form';
import type { ConfirmEmailFormState } from './confirm-email-form-state';
import { ConfirmEmailFormView } from './confirm-email-form-view';

const mocks = vi.hoisted(() => ({
  confirmEmailAction: vi.fn<typeof confirmEmailAction>(),
}));
vi.mock('./confirm-email-action', () => ({
  confirmEmailAction: mocks.confirmEmailAction,
}));

const view = (
  state: ConfirmEmailFormState,
  pending = false,
  formAction = vi.fn(),
) => (
  <ConfirmEmailFormView
    state={state}
    pending={pending}
    formAction={formAction}
  />
);
const passwordInput = () => screen.getByLabelText<HTMLInputElement>('Password');

afterEach(cleanup);

describe('ConfirmEmailFormView', () => {
  it('shows one password field and "Confirm my email", no alert before the first submit', () => {
    const { container } = render(view({ kind: 'idle' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm my email' })).toBeTruthy();
    expect(
      [...container.querySelectorAll('input')].map((input) => input.name),
    ).toEqual(['password']);
    expect(passwordInput()).toMatchObject({
      type: 'password',
      autocomplete: 'current-password',
      maxLength: 1024,
      required: true,
    });
  });

  it.each<[ConfirmEmailFormState, RegExp]>([
    [{ kind: 'wrong_password' }, /password didn't match.*when you signed up/],
    [
      { kind: 'rate_limited', retryAfterSeconds: 900 },
      /Too many attempts.*Wait, then open the link in your email again in 15 minutes\./,
    ],
    [{ kind: 'rate_limited', retryAfterSeconds: null }, /in a few minutes/],
    [{ kind: 'busy' }, /busy.*Wait a moment/],
    [{ kind: 'unavailable' }, /couldn't confirm your email right now/],
    [{ kind: 'off_on_preview' }, /off on preview deployments/],
  ])('announces %o with its own copy', (state, copy) => {
    render(view(state));
    expect(screen.getByRole('alert').textContent).toMatch(copy);
  });

  it('marks the field invalid only for a wrong password', () => {
    render(view({ kind: 'wrong_password' }));
    const alertId = screen.getByRole('alert').id;
    expect(passwordInput().getAttribute('aria-invalid')).toBe('true');
    expect(passwordInput().getAttribute('aria-describedby')).toBe(alertId);
    cleanup();
    render(view({ kind: 'unavailable' }));
    expect(passwordInput().hasAttribute('aria-invalid')).toBe(false);
    expect(passwordInput().hasAttribute('aria-describedby')).toBe(false);
  });

  it('pending hides the previous alert, so the same failure is announced again', () => {
    const { rerender } = render(view({ kind: 'wrong_password' }));
    const first = screen.getByRole('alert');

    rerender(view({ kind: 'wrong_password' }, true));
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(view({ kind: 'wrong_password' }));
    expect(screen.getByRole('alert')).not.toBe(first);
  });

  it('locks the form while pending and cancels a second submit, without disabling the button', () => {
    render(view({ kind: 'idle' }, true));
    const button = screen.getByRole('button', { name: /Confirming/ });
    const form = button.closest('form');

    expect(form?.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(passwordInput().hasAttribute('readonly')).toBe(true);
    expect(form && fireEvent.submit(form)).toBe(false);
  });

  it('empties a typed password when the form is hidden in an Activity', () => {
    const inActivity = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>{view({ kind: 'idle' })}</Activity>
    );
    const { rerender } = render(inActivity('visible'));
    const password = passwordInput();
    fireEvent.change(password, { target: { value: 'secret-pass-1' } });

    rerender(inActivity('hidden'));
    expect(password.value).toBe('');
  });
});

describe('ConfirmEmailForm', () => {
  it('posts only the password, once, and empties the field after a failure', async () => {
    mocks.confirmEmailAction.mockResolvedValue({ kind: 'wrong_password' });
    render(<ConfirmEmailForm />);
    const password = passwordInput();

    fireEvent.change(password, { target: { value: 'never-keep-this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email' }));
    await screen.findByRole('alert');

    expect(mocks.confirmEmailAction).toHaveBeenCalledTimes(1);
    const [previousState, formData] =
      mocks.confirmEmailAction.mock.calls[0] ?? [];
    expect(previousState).toEqual({ kind: 'idle' });
    expect([...(formData?.entries() ?? [])]).toEqual([
      ['password', 'never-keep-this'],
    ]);
    expect(password.value).toBe('');
    expect(document.body.innerHTML).not.toContain('never-keep-this');
  });
});
