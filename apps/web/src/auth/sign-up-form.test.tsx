import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { signUpAction } from './sign-up-action';
import { SignUpForm } from './sign-up-form';

const mocks = vi.hoisted(() => ({
  signUpAction: vi.fn<typeof signUpAction>(),
}));
vi.mock('./sign-up-action', () => ({ signUpAction: mocks.signUpAction }));

it('posts the three fields once, then restores username and email but never the password', async () => {
  mocks.signUpAction.mockResolvedValue({ kind: 'username_taken' });
  render(<SignUpForm />);
  const username = screen.getByLabelText<HTMLInputElement>('Username');
  const email = screen.getByLabelText<HTMLInputElement>('Email');
  const password = screen.getByLabelText<HTMLInputElement>('Password');

  fireEvent.change(username, { target: { value: 'kaito_tanaka' } });
  fireEvent.change(email, { target: { value: 'kaito@example.com' } });
  fireEvent.change(password, { target: { value: 'never-keep-this-1' } });
  fireEvent.click(screen.getByRole('button'));
  const alert = await screen.findByRole('alert');

  expect(mocks.signUpAction).toHaveBeenCalledTimes(1);
  const [previousState, formData] = mocks.signUpAction.mock.calls[0] ?? [];
  expect(previousState).toEqual({ kind: 'idle' });
  expect([...(formData?.entries() ?? [])]).toEqual([
    ['username', 'kaito_tanaka'],
    ['email', 'kaito@example.com'],
    ['password', 'never-keep-this-1'],
  ]);
  expect(alert.textContent).toMatch(/That username is taken/);
  expect(username.value).toBe('kaito_tanaka');
  expect(email.value).toBe('kaito@example.com');
  expect(password.value).toBe('');
  expect(password.defaultValue).toBe('');
});
