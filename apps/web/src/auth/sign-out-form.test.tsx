import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { Component, type ReactNode } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  onTestFinished,
  vi,
} from 'vitest';
import { ACTION_THROTTLED_TEXT } from './action-throttle-text';
import type { signOutAction } from './sign-out-action';
import { SignOutForm } from './sign-out-form';
import type { SignOutFormState } from './sign-out-state';

const mocks = vi.hoisted(() => ({
  signOutAction: vi.fn<typeof signOutAction>(),
}));
vi.mock('./sign-out-action', () => ({ signOutAction: mocks.signOutAction }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// What the client rejects a redirecting Server Action with (Next's redirect digest).
const REDIRECT_HOME = Object.assign(new Error('NEXT_REDIRECT'), {
  digest: 'NEXT_REDIRECT;replace;/;303;',
});

const RELOAD_TEXT = 'Could not sign out. Reload the page and try again.';

// Next's client throws an `UnrecognizedActionError` when the server no longer knows the action id
// (a deploy since load); this models its name and message only.
const STALE_ACTION_ID = Object.assign(new Error(
  'Server Action "7f3a" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
), { name: 'UnrecognizedActionError' });

// What Next's client throws when the proxy throttle answers the action POST 429 `text/plain`.
const THROTTLED = new Error(ACTION_THROTTLED_TEXT);
const WAIT_TEXT =
  'Too many requests from your network. Wait a minute, then try again.';

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
// React logs every error a boundary catches: expected only in the boundary tests.
const silenceBoundaryLogs = () =>
  consoleError.mockImplementation(() => undefined);

beforeEach(() => {
  mocks.signOutAction.mockReset();
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
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

  it('after a rejected action, asks for a reload with a focused button that submits again', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(new Error('Failed to fetch'));
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();
    expect(await alertText()).toBe(RELOAD_TEXT);
    expect(document.activeElement).toBe(button());
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    expect(await alertText()).toBe(RELOAD_TEXT);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(button().nextElementSibling).toBe(screen.getByRole('alert'));
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(screen.queryByText(/Router:/)).toBeNull();
  });

  it('asks for a reload when a stale action id after a deploy rejects the action', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(STALE_ACTION_ID);
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();

    expect(await alertText()).toBe(RELOAD_TEXT);
    expect(screen.queryByText(/Router:/)).toBeNull();
  });

  it('says only that it could not sign out when a refusal follows a rejection', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction
      .mockRejectedValueOnce(STALE_ACTION_ID)
      .mockResolvedValueOnce({ kind: 'refused' });
    render(<SignOutForm />);

    submit();
    expect(await alertText()).toBe(RELOAD_TEXT);
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    expect((await screen.findByText('Could not sign out')).textContent).toBe(
      'Could not sign out',
    );
    expect(screen.queryByText(RELOAD_TEXT)).toBeNull();
  });

  it('asks for a reload when a rejection follows a refusal', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction
      .mockResolvedValueOnce({ kind: 'refused' })
      .mockRejectedValueOnce(STALE_ACTION_ID);
    render(<SignOutForm />);

    submit();
    expect(await alertText()).toBe('Could not sign out');
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    await screen.findByText(RELOAD_TEXT);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('after a rejection, hides the reload alert while the next submit is pending', async () => {
    silenceBoundaryLogs();
    const answer = Promise.withResolvers<SignOutFormState>();
    mocks.signOutAction
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockReturnValueOnce(answer.promise);
    render(<SignOutForm />);
    submit();
    expect(await alertText()).toBe(RELOAD_TEXT);

    submit();

    await waitFor(() =>
      expect(button().getAttribute('aria-disabled')).toBe('true'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      answer.resolve({ kind: 'refused' });
      await answer.promise;
    });
    expect(await alertText()).toBe('Could not sign out');
  });

  it('reports nothing from the browser after a rejection', async () => {
    silenceBoundaryLogs();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const sendBeacon = vi.fn<Navigator['sendBeacon']>(() => true);
    // jsdom has no sendBeacon: defined on this navigator for the test, removed after it.
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon,
      configurable: true,
    });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'sendBeacon');
    });
    mocks.signOutAction.mockRejectedValue(STALE_ACTION_ID);
    render(<SignOutForm />);

    submit();

    expect(await alertText()).toBe(RELOAD_TEXT);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
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

  it('at the throttle cap says to wait, with a focused button that submits again', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(THROTTLED);
    render(
      <RouterBoundary>
        <SignOutForm />
      </RouterBoundary>,
    );

    submit();
    expect(await alertText()).toBe(WAIT_TEXT);
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute('aria-disabled')).toBe('false');
    expect(button().nextElementSibling).toBe(screen.getByRole('alert'));
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    expect(await alertText()).toBe(WAIT_TEXT);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(document.activeElement).toBe(button());
    expect(screen.queryByText(/Router:/)).toBeNull();
  });

  it.each([
    ['the throttle text with a trailing space', `${ACTION_THROTTLED_TEXT} `],
    ['a generic text/plain answer', 'An unexpected response was received from the server.'],
  ])('asks for a reload, not to wait, for %s', async (_case, message) => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(new Error(message));
    render(<SignOutForm />);

    submit();

    expect(await alertText()).toBe(RELOAD_TEXT);
  });

  it('asks for a reload, not to wait, when the throttle text is thrown as a string', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction.mockRejectedValue(ACTION_THROTTLED_TEXT);
    render(<SignOutForm />);

    submit();

    expect(await alertText()).toBe(RELOAD_TEXT);
  });

  it.each([
    ['throttled then failed', THROTTLED, STALE_ACTION_ID, WAIT_TEXT, RELOAD_TEXT],
    ['failed then throttled', STALE_ACTION_ID, THROTTLED, RELOAD_TEXT, WAIT_TEXT],
  ])('shows only the latest alert when %s', async (_case, first, second, firstText, secondText) => {
    silenceBoundaryLogs();
    mocks.signOutAction
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second);
    render(<SignOutForm />);

    submit();
    expect(await alertText()).toBe(firstText);
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    await screen.findByText(secondText);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(document.activeElement).toBe(button());
  });

  it('says only that it could not sign out when a refusal follows the throttle', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction
      .mockRejectedValueOnce(THROTTLED)
      .mockResolvedValueOnce({ kind: 'refused' });
    render(<SignOutForm />);

    submit();
    expect(await alertText()).toBe(WAIT_TEXT);
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    await screen.findByText('Could not sign out');
    expect(screen.queryByText(WAIT_TEXT)).toBeNull();
  });

  it('says to wait when the throttle follows a refusal', async () => {
    silenceBoundaryLogs();
    mocks.signOutAction
      .mockResolvedValueOnce({ kind: 'refused' })
      .mockRejectedValueOnce(THROTTLED);
    render(<SignOutForm />);

    submit();
    expect(await alertText()).toBe('Could not sign out');
    submit();

    await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalledTimes(2));
    await screen.findByText(WAIT_TEXT);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('after the throttle, hides the alert and makes one call for a double click while pending', async () => {
    silenceBoundaryLogs();
    const answer = Promise.withResolvers<SignOutFormState>();
    mocks.signOutAction
      .mockRejectedValueOnce(THROTTLED)
      .mockReturnValueOnce(answer.promise);
    render(<SignOutForm />);
    submit();
    expect(await alertText()).toBe(WAIT_TEXT);

    submit();
    await waitFor(() =>
      expect(button().getAttribute('aria-disabled')).toBe('true'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    submit();
    await act(async () => {
      answer.resolve({ kind: 'refused' });
      await answer.promise;
    });

    expect(await alertText()).toBe('Could not sign out');
    expect(mocks.signOutAction).toHaveBeenCalledTimes(2);
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
