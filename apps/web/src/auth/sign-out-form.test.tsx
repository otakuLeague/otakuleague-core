import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  mocks.signOutAction.mockReset();
  // React logs every error a boundary catches; these are expected here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SignOutForm', () => {
  it('shows one Sign out button, no field and no alert before a submit', () => {
    const { container } = render(<SignOutForm />);

    expect(button().getAttribute('type')).toBe('submit');
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(
      0,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it could not sign out after a refusal and keeps the button', async () => {
    mocks.signOutAction.mockResolvedValue({ kind: 'refused' });
    render(<SignOutForm />);

    submit();

    expect(await alertText()).toBe('Could not sign out');
    expect(mocks.signOutAction).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-disabled')).toBe('false');
  });

  it('after a rejected action, shows the alert with a button that submits again', async () => {
    mocks.signOutAction.mockRejectedValue(new Error('Failed to fetch'));
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();
    expect(await alertText()).toBe('Could not sign out');
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    expect(await alertText()).toBe('Could not sign out');
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(screen.queryByText(/Router:/)).toBeNull();
  });

  it('passes a rejection with Next redirect digest on to the router boundary, with no alert', async () => {
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
  });
});
