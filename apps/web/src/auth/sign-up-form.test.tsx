import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { signUpAction } from './sign-up-action';
import type { SignUpFormState } from './sign-up-form-state';
import { SIGN_IN_PASSWORD_ID } from './sign-in-form-view';
import { SignUpForm } from './sign-up-form';

const mocks = vi.hoisted(() => ({
  signUpAction: vi.fn<typeof signUpAction>(),
}));
vi.mock('./sign-up-action', () => ({ signUpAction: mocks.signUpAction }));

afterEach(cleanup);

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const createAccount = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
const metRules = () =>
  screen
    .getAllByRole('listitem')
    .filter((rule) => rule.hasAttribute('data-met')).length;

it('posts the three fields once, then restores username and email but never the password', async () => {
  mocks.signUpAction.mockResolvedValue({ kind: 'username_taken' });
  render(<SignUpForm />);
  const username = screen.getByLabelText<HTMLInputElement>('Username');
  const email = screen.getByLabelText<HTMLInputElement>('Email');
  const password = screen.getByLabelText<HTMLInputElement>('Password');

  fireEvent.change(username, { target: { value: 'kaito_tanaka' } });
  fireEvent.change(email, { target: { value: 'kaito@example.com' } });
  fireEvent.change(password, { target: { value: 'never-keep-this-1' } });
  type('Confirm password', 'never-keep-this-1');
  expect(metRules()).toBe(2);
  createAccount();
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
  expect(
    screen.getByLabelText<HTMLInputElement>('Confirm password').value,
  ).toBe('');
  // React's reset emptied the password without an input event: the ticks follow it.
  expect(metRules()).toBe(0);
});

it.each([
  ['the rules are unmet', 'abcdefgh', 'abcdefgh', 'Password', /at least 8/],
  [
    'the two passwords differ',
    'secret-pass-1',
    'secret-pass-2',
    'Confirm password',
    /don't match/,
  ],
])(
  'makes 0 action calls when %s, until an edit clears the block (N32)',
  (_, password, confirm, label, message) => {
    mocks.signUpAction.mockReset();
    render(<SignUpForm />);
    type('Username', 'mio');
    type('Email', 'mio@example.com');
    type('Password', password);
    type('Confirm password', confirm);

    createAccount();
    createAccount();
    expect(mocks.signUpAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(message);
    expect(document.activeElement).toBe(screen.getByLabelText(label));
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe(
      'true',
    );

    type(label, `${label === 'Password' ? password : confirm}x`);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText(label).hasAttribute('aria-invalid')).toBe(
      false,
    );
  },
);

it('posts once after a blocked submit is fixed', async () => {
  mocks.signUpAction.mockReset();
  mocks.signUpAction.mockResolvedValue({ kind: 'busy' });
  render(<SignUpForm />);
  type('Username', 'mio');
  type('Email', 'mio@example.com');
  type('Password', 'secret-pass-1');
  type('Confirm password', 'secret-pass-2');
  createAccount();
  expect(mocks.signUpAction).not.toHaveBeenCalled();

  type('Confirm password', 'secret-pass-1');
  createAccount();
  expect((await screen.findByRole('alert')).textContent).toMatch(/busy/);
  expect(mocks.signUpAction).toHaveBeenCalledTimes(1);
});

it('forgets the ticks and the block when hidden in an Activity (the inputs are emptied)', () => {
  mocks.signUpAction.mockReset();
  const inActivity = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <SignUpForm />
    </Activity>
  );
  const { rerender } = render(inActivity('visible'));
  type('Username', 'mio');
  type('Email', 'mio@example.com');
  type('Password', 'secret-pass-1');
  type('Confirm password', 'secret-pass-2');
  createAccount();
  expect([metRules(), screen.queryAllByRole('alert').length]).toEqual([2, 1]);

  rerender(inActivity('hidden'));
  rerender(inActivity('visible'));
  expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  expect([metRules(), screen.queryAllByRole('alert').length]).toEqual([0, 0]);
  expect(mocks.signUpAction).not.toHaveBeenCalled();
});

it('makes one call for two submits while the first is pending (N29)', async () => {
  let settle: (state: SignUpFormState) => void = () => undefined;
  mocks.signUpAction.mockReset();
  mocks.signUpAction.mockReturnValue(
    new Promise<SignUpFormState>((resolve) => {
      settle = resolve;
    }),
  );
  render(<SignUpForm />);
  for (const [label, value] of [
    ['Username', 'mio'],
    ['Email', 'mio@example.com'],
    ['Password', 'secret-pass-1'],
    ['Confirm password', 'secret-pass-1'],
  ] as const) {
    type(label, value);
  }

  createAccount();
  await screen.findByRole('button', { name: /Creating account/ });
  fireEvent.click(screen.getByRole('button', { name: /Creating account/ }));
  expect(mocks.signUpAction).toHaveBeenCalledTimes(1);

  await act(() => {
    settle({ kind: 'busy' });
    return Promise.resolve();
  });
  expect((await screen.findByRole('alert')).textContent).toMatch(/busy/);
  expect(mocks.signUpAction).toHaveBeenCalledTimes(1);
});

it('empties a typed sign-in password when it mounts, and leaves other fields alone', () => {
  // The sign-in form stays mounted (CSS-hidden) while the sign-up panel appears beside it.
  const page = (signUp: boolean) => (
    <>
      <input id="sign-in-identifier" aria-label="Sign-in identifier" />
      <input
        id={SIGN_IN_PASSWORD_ID}
        type="password"
        aria-label="Sign-in password"
      />
      {signUp && <SignUpForm />}
    </>
  );
  const { rerender } = render(page(false));
  const identifier =
    screen.getByLabelText<HTMLInputElement>('Sign-in identifier');
  const signInPassword =
    screen.getByLabelText<HTMLInputElement>('Sign-in password');
  fireEvent.change(identifier, { target: { value: 'mio' } });
  fireEvent.change(signInPassword, {
    target: { value: 'typed-before-switch' },
  });

  rerender(page(true));
  expect(screen.getByLabelText('Sign-in password')).toBe(signInPassword);
  expect(signInPassword.value).toBe('');
  expect(identifier.value).toBe('mio');
});
