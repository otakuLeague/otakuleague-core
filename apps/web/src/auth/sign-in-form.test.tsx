import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { signInAction } from './sign-in-action';
import { SignInForm } from './sign-in-form';

const mocks = vi.hoisted(() => ({
  signInAction: vi.fn<typeof signInAction>(),
}));
vi.mock('./sign-in-action', () => ({ signInAction: mocks.signInAction }));

it('posts the typed fields and next once, then keeps only the identifier after a failure', async () => {
  mocks.signInAction.mockResolvedValue({ kind: 'invalid_credentials' });
  render(
    <SignInForm>
      <input type="hidden" name="next" value="/season" />
    </SignInForm>,
  );
  const identifier =
    screen.getByLabelText<HTMLInputElement>('Email or username');
  const password = screen.getByLabelText<HTMLInputElement>('Password');

  fireEvent.change(identifier, { target: { value: 'kaito_tanaka' } });
  fireEvent.change(password, { target: { value: 'never-keep-this' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('alert');

  expect(mocks.signInAction).toHaveBeenCalledTimes(1);
  const [previousState, formData] = mocks.signInAction.mock.calls[0] ?? [];
  expect(previousState).toEqual({ kind: 'idle' });
  expect([...(formData?.entries() ?? [])]).toEqual([
    ['identifier', 'kaito_tanaka'],
    ['password', 'never-keep-this'],
    ['next', '/season'],
  ]);
  expect(identifier.value).toBe('kaito_tanaka');
  expect(password.value).toBe('');
});
