import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import type { signOutAction } from './sign-out-action';
import { SignOutForm } from './sign-out-form';
import type { SignOutFormState } from './sign-out-state';

const mocks = vi.hoisted(() => ({
  signOutAction: vi.fn<typeof signOutAction>(),
}));
vi.mock('./sign-out-action', () => ({ signOutAction: mocks.signOutAction }));

// What the client rejects a redirecting Server Action with (Next's redirect digest).
const REDIRECT_HOME = Object.assign(new Error('NEXT_REDIRECT'), {
  digest: 'NEXT_REDIRECT;replace;/;303;',
});

type RouterBoundaryState = { readonly caught: string | null };

/** Stands in for Next's RedirectBoundary above the header. */
class RouterBoundary extends Component<
  { readonly children: ReactNode },
  RouterBoundaryState
> {
  state: RouterBoundaryState = { caught: null };

  static getDerivedStateFromError(error: unknown): RouterBoundaryState {
    return { caught: error === REDIRECT_HOME ? 'the redirect' : 'another' };
  }

  render() {
    const { caught } = this.state;
    return caught === null ? this.props.children : <p>Router: {caught}</p>;
  }
}

const button = () => screen.getByRole('button', { name: 'Sign out' });
const submit = () => fireEvent.click(button());
const alertText = async () => (await screen.findByRole('alert')).textContent;
let consoleError: MockInstance<typeof console.error>;
// React logs every error a boundary catches: expected only in the two boundary tests.
const silenceBoundaryLogs = () =>
  consoleError.mockImplementation(() => undefined);

beforeEach(() => {
  mocks.signOutAction.mockReset();
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SignOutForm', () => {
  it('shows one unfocused Sign out button, no field and no alert before a submit', () => {
    const { container } = render(<SignOutForm />);

    expect(button().getAttribute('type')).toBe('submit');
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(document.activeElement).toBe(document.body);
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(
      0,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says it could not sign out after a refusal, below the button it keeps', async () => {
    mocks.signOutAction.mockResolvedValue({ kind: 'refused' });
    render(<SignOutForm />);

    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not sign out');
    expect(button().nextElementSibling).toBe(alert);
    expect(mocks.signOutAction).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('after a rejected action, shows the alert with a focused button that submits again', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(new Error('Failed to fetch'));
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();
    expect(await alertText()).toBe('Could not sign out');
    expect(document.activeElement).toBe(button());
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    expect(await alertText()).toBe('Could not sign out');
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(screen.queryByText(/Router:/)).toBeNull();
  });

  it('passes a rejection with Next redirect digest on to the router boundary, with no alert', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(REDIRECT_HOME);
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();

    await screen.findByText('Router: the redirect');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('while pending hides the alert and cancels a second submit', async () => {
    const answer = Promise.withResolvers<SignOutFormState>();
    mocks.signOutAction
      .mockResolvedValueOnce({ kind: 'refused' })
      .mockReturnValueOnce(answer.promise);
    render(<SignOutForm />);
    submit();
    await screen.findByRole('alert');

    submit();
    await waitFor(() =>
      expect(button().getAttribute('aria-disabled')).toBe('true'),
    );
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    submit();
    await act(async () => {
      answer.resolve({ kind: 'refused' });
      await answer.promise;
    });

    await screen.findByRole('alert');
    expect(mocks.signOutAction).toHaveBeenCalledTimes(2);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
