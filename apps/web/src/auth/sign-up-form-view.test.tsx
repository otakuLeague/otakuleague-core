import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignUpFormState } from './sign-up-form-state';
import { SignUpFormView } from './sign-up-form-view';
import type { SignUpSubmitBlock } from './sign-up-password-checks';

const KEPT = { username: 'kaito_tanaka', email: 'kaito@example.com' };
const RULE_IDS = 'sign-up-rule-length sign-up-rule-symbol';
const UNMET = { longEnough: false, hasDigitOrSymbol: false };
const spiesOf = () => ({
  onFieldsSubmit: vi.fn(),
  onRulesChange: vi.fn(),
  onBlockChange: vi.fn(),
  formAction: vi.fn(),
});

const view = (
  state: SignUpFormState,
  pending = false,
  spies = spiesOf(),
  {
    rules = UNMET,
    block = 'none',
  }: { rules?: typeof UNMET; block?: SignUpSubmitBlock } = {},
) => (
  <SignUpFormView
    state={state}
    pending={pending}
    kept={KEPT}
    rules={rules}
    block={block}
    {...spies}
  />
);

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const fields = () => ['Username', 'Email', 'Password'].map(input);
const type = (label: string, value: string) =>
  fireEvent.change(input(label), { target: { value } });
const submit = () =>
  fireEvent.submit(input('Username').closest('form') as HTMLFormElement);

describe('SignUpFormView', () => {
  afterEach(cleanup);

  it('shows no alert before the first submit, and both rules unmet under the password', () => {
    render(view({ kind: 'idle' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    const rules = screen.getByRole('list', { name: 'Password rules' });
    expect(
      [...rules.querySelectorAll('li')].map((rule) => [
        rule.textContent,
        rule.hasAttribute('data-met'),
      ]),
    ).toEqual([
      ['At least 8 characters: not met.', false],
      ['A number or symbol: not met.', false],
    ]);
    expect(input('Password').getAttribute('aria-describedby')).toBe(RULE_IDS);
  });

  it('ticks each met rule with text, not colour alone', () => {
    render(
      view({ kind: 'idle' }, false, spiesOf(), {
        rules: { longEnough: false, hasDigitOrSymbol: true },
      }),
    );
    const [length, symbol] = screen.getAllByRole('listitem');
    expect(length?.hasAttribute('data-met')).toBe(false);
    expect(symbol?.getAttribute('data-met')).toBe('');
    expect(symbol?.textContent).toBe('A number or symbol: done.');
    expect(length?.textContent).toBe('At least 8 characters: not met.');
  });

  it('reports only rule booleans as the password is typed, and clears a block on any edit', () => {
    const spies = spiesOf();
    render(view({ kind: 'idle' }, false, spies));
    type('Password', 'abcdefg');
    type('Password', 'abcdefg1');
    type('Confirm password', 'abc');
    expect(spies.onRulesChange.mock.calls).toEqual([
      [{ longEnough: false, hasDigitOrSymbol: false }],
      [{ longEnough: true, hasDigitOrSymbol: true }],
    ]);
    expect(spies.onBlockChange.mock.calls).toEqual([
      ['none'],
      ['none'],
      ['none'],
    ]);
  });

  it.each<[string, string, string, SignUpSubmitBlock, string]>([
    ['a short password', 'abc1', 'abc1', 'rules_unmet', 'Password'],
    ['empty fields', '', '', 'rules_unmet', 'Password'],
    [
      'a mismatch',
      'secret-pass-1',
      'secret-pass-2',
      'confirm_mismatch',
      'Confirm password',
    ],
  ])(
    'cancels a submit with %s and focuses that field',
    (_, password, confirm, block, label) => {
      const spies = spiesOf();
      render(view({ kind: 'idle' }, false, spies));
      type('Password', password);
      type('Confirm password', confirm);
      spies.onBlockChange.mockClear();

      expect(submit()).toBe(false);
      expect(spies.onBlockChange.mock.calls).toEqual([[block]]);
      expect(document.activeElement).toBe(input(label));
      expect(spies.onFieldsSubmit).not.toHaveBeenCalled();
      expect(spies.formAction).not.toHaveBeenCalled();
    },
  );

  it.each<[SignUpSubmitBlock, string, string, string]>([
    [
      'rules_unmet',
      'Password',
      'Passwords need at least 8 characters and a number or symbol.',
      `sign-up-password-error ${RULE_IDS}`,
    ],
    [
      'confirm_mismatch',
      'Confirm password',
      "Passwords don't match.",
      'sign-up-confirm-error',
    ],
  ])(
    'shows %s under its field, which it marks invalid and describes',
    (block, label, message, describedBy) => {
      render(view({ kind: 'idle' }, false, spiesOf(), { block }));
      const alert = screen.getByRole('alert');
      expect([
        alert.className,
        alert.getAttribute('data-tone'),
        alert.textContent,
      ]).toEqual(['au-msg', 'bad', message]);
      expect(alert.closest('.au-field')?.contains(input(label))).toBe(true);
      expect(input(label).getAttribute('aria-invalid')).toBe('true');
      expect(input(label).getAttribute('aria-describedby')).toBe(describedBy);
      const other = label === 'Password' ? 'Confirm password' : 'Password';
      expect(input(other).hasAttribute('aria-invalid')).toBe(false);
    },
  );

  it.each<[SignUpFormState, string, string]>([
    [
      { kind: 'invalid_fields', fields: ['username', 'email', 'password'] },
      'Some details need another look.',
      'Usernames are 3 to 20 letters, numbers or underscores. Enter a valid email address. Passwords need 8 to 128 characters with a number or symbol, and common ones are refused.',
    ],
    [
      { kind: 'invalid_fields', fields: ['password'] },
      'Some details need another look.',
      'Passwords need 8 to 128 characters with a number or symbol, and common ones are refused.',
    ],
    [
      { kind: 'username_taken' },
      'That username is taken.',
      'Pick another one. If you already signed up with it, the confirmation email we sent still works.',
    ],
    [
      { kind: 'sign_up_closed' },
      "New accounts aren't open yet.",
      'Already have one? Sign in below.',
    ],
    [
      { kind: 'rate_limited', retryAfterSeconds: 120 },
      'Slow down a little.',
      'Too many sign-ups from this network. Try again in 2 minutes.',
    ],
    [
      { kind: 'rate_limited', retryAfterSeconds: null },
      'Slow down a little.',
      'Too many sign-ups from this network. Try again in a few minutes.',
    ],
    [{ kind: 'busy' }, 'Sign-up is busy.', 'Wait a moment, then try again.'],
    [
      { kind: 'unavailable' },
      "We couldn't confirm your sign-up.",
      'Something went wrong on our side. If a confirmation email arrives, its link still works. Otherwise try again in a little while.',
    ],
    [
      { kind: 'off_on_preview' },
      'Sign-up is off on preview deployments',
      'Use the live site to sign up.',
    ],
  ])('announces %o with its own copy', (state, title, detail) => {
    render(view(state));
    const alert = screen.getByRole('alert');
    expect(alert.querySelector('strong')?.textContent).toBe(title);
    expect(alert.querySelector('span')?.textContent).toBe(detail);
    expect(alert.textContent).not.toMatch(/nothing was saved/i);
  });

  it('marks only the named fields invalid, described by the alert (and the two rule items)', () => {
    render(view({ kind: 'invalid_fields', fields: ['email', 'password'] }));
    const alertId = screen.getByRole('alert').id;
    const [username, email, password] = fields();
    expect(username?.hasAttribute('aria-invalid')).toBe(false);
    expect(username?.hasAttribute('aria-describedby')).toBe(false);
    expect(email?.getAttribute('aria-invalid')).toBe('true');
    expect(email?.getAttribute('aria-describedby')).toBe(alertId);
    expect(password?.getAttribute('aria-invalid')).toBe('true');
    expect(password?.getAttribute('aria-describedby')).toBe(
      `${alertId} ${RULE_IDS}`,
    );
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
    const spies = spiesOf();
    const { rerender } = render(view({ kind: 'username_taken' }));
    const first = screen.getByRole('alert');
    rerender(view({ kind: 'username_taken' }, true, spies));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(input('Username').hasAttribute('aria-invalid')).toBe(false);
    const button = screen.getByRole('button', { name: /Creating account/ });
    expect(button.closest('form')?.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(fields().every((field) => field.readOnly)).toBe(true);
    expect(input('Confirm password').readOnly).toBe(true);
    expect(fireEvent.submit(button.closest('form') as HTMLFormElement)).toBe(
      false,
    );
    expect(spies.onFieldsSubmit).not.toHaveBeenCalled();
    expect(spies.formAction).not.toHaveBeenCalled();

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
    expect(input('Email')).toMatchObject({
      id: 'sign-up-email',
      name: 'email',
      type: 'email',
      autocomplete: 'email',
      maxLength: 254,
      required: true,
      value: KEPT.email,
    });
    expect(input('Password')).toMatchObject({
      id: 'sign-up-password',
      name: 'password',
      type: 'password',
      autocomplete: 'new-password',
      maxLength: 1024,
      required: true,
      value: '',
      defaultValue: '',
    });
    expect(input('Confirm password')).toMatchObject({
      id: 'sign-up-confirm',
      name: '',
      type: 'password',
      autocomplete: 'new-password',
      maxLength: 1024,
      required: true,
      defaultValue: '',
    });
    const passwords = [input('Password'), input('Confirm password')];
    for (const field of [input('Username'), ...passwords]) {
      expect(
        ['autocapitalize', 'autocorrect', 'spellcheck'].map((name) =>
          field.getAttribute(name),
        ),
      ).toEqual(['none', 'off', 'false']);
    }
  });

  it('gives each password field its own Show button, hidden again by a submit and while pending', () => {
    const { rerender } = render(view({ kind: 'idle' }));
    const showPassword = screen.getByRole('button', { name: 'Show password' });
    const showConfirm = screen.getByRole('button', {
      name: 'Show confirmation',
    });
    expect(
      [showPassword, showConfirm].map((b) => b.getAttribute('aria-controls')),
    ).toEqual(['sign-up-password', 'sign-up-confirm']);
    fireEvent.click(showConfirm);
    expect([input('Password').type, input('Confirm password').type]).toEqual([
      'password',
      'text',
    ]);
    submit();
    expect(input('Confirm password').type).toBe('password');

    fireEvent.click(showConfirm);
    rerender(view({ kind: 'idle' }, true));
    expect(input('Confirm password').type).toBe('password');
    expect(
      [showPassword, showConfirm].map((b) => b.getAttribute('aria-disabled')),
    ).toEqual(['true', 'true']);
  });

  it('keeps a typed password across a pending rerender (only hiding empties it)', () => {
    const { rerender } = render(view({ kind: 'idle' }));
    const password = input('Password');
    fireEvent.change(password, { target: { value: 'secret-pass-1' } });

    rerender(view({ kind: 'idle' }, true));
    expect(password.value).toBe('secret-pass-1');
    expect(input('Password')).toBe(password);
  });

  it('empties a typed password when the form is hidden in an Activity', () => {
    const inActivity = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>{view({ kind: 'idle' })}</Activity>
    );
    const { rerender } = render(inActivity('visible'));
    const password = input('Password');
    const confirm = input('Confirm password');
    fireEvent.change(password, { target: { value: 'secret-pass-1' } });
    fireEvent.change(confirm, { target: { value: 'secret-pass-1' } });
    fireEvent.change(input('Email'), { target: { value: 'kept@example.com' } });

    rerender(inActivity('hidden'));
    expect([password.value, confirm.value]).toEqual(['', '']);
    expect(
      document.querySelector<HTMLInputElement>('#sign-up-email')?.value,
    ).toBe('kept@example.com');
  });

  it('reports the submitted username and email, never the password', () => {
    const spies = spiesOf();
    render(view({ kind: 'idle' }, false, spies));
    type('Username', 'mio');
    type('Email', 'mio@example.com');
    type('Password', 'secret-1');
    type('Confirm password', 'secret-1');
    spies.onBlockChange.mockClear();
    submit();
    expect(spies.onBlockChange.mock.calls).toEqual([['none']]);
    expect(spies.onFieldsSubmit).toHaveBeenCalledWith({
      username: 'mio',
      email: 'mio@example.com',
    });
  });
});
