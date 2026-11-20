import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '../auth/viewer';
import {
  GuestActionsSizer,
  ViewerActions,
  ViewerActionsView,
  ViewerFallback,
  viewerInitials,
} from './viewer-actions';

const loadViewer = vi.hoisted(() => vi.fn<() => Promise<Viewer>>());
vi.mock('../auth/load-viewer', () => ({ loadViewer }));

function expectGuestLinks() {
  expect(
    screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
  ).toBe('/auth?mode=sign-in');
  const signUp = screen.getByRole('link', { name: 'Sign up' });
  expect(signUp.getAttribute('href')).toBe('/auth?mode=sign-up');
  expect(signUp.classList.contains('sh-only-desktop')).toBe(true);
}

describe('viewerInitials', () => {
  it('takes the first two characters, upper case', () => {
    expect(viewerInitials('kaito_tanaka')).toBe('KA');
    expect(viewerInitials('_a1')).toBe('_A');
  });
});

describe('ViewerActionsView', () => {
  afterEach(cleanup);

  it('offers a guest Sign in and Sign up', () => {
    render(<ViewerActionsView viewer={{ kind: 'signed_out' }} />);

    expectGuestLinks();
  });

  it('renders nothing for an unknown viewer', () => {
    const { container } = render(
      <ViewerActionsView viewer={{ kind: 'unavailable' }} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows a member the account menu: initials, then the username', () => {
    render(
      <ViewerActionsView
        viewer={{ kind: 'signed_in', username: 'kaito_tanaka' }}
      />,
    );

    const summary = screen.getByText('KA');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.getAttribute('aria-label')).toBe('Account menu');
    expect(summary.classList.contains('sh-avatar')).toBe(true);
    const head = screen.getByText('kaito_tanaka');
    expect(head.classList.contains('sh-menu__head')).toBe(true);
    expect(head.closest('.sh-menu')?.firstElementChild).toBe(head);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('keeps the longest username whole in the DOM (CSS ellipsis only)', () => {
    const username = 'abcdefghij0123456789';
    render(<ViewerActionsView viewer={{ kind: 'signed_in', username }} />);

    expect(screen.getByText(username).textContent).toBe(username);
    expect(screen.getByText('AB')).not.toBeNull();
  });
});

describe('ViewerActions', () => {
  afterEach(() => {
    cleanup();
    loadViewer.mockReset();
  });

  it.each<[Viewer, string | null]>([
    [{ kind: 'signed_out' }, 'Sign in'],
    [{ kind: 'unavailable' }, null],
    [{ kind: 'signed_in', username: 'kaito_tanaka' }, 'kaito_tanaka'],
  ])('renders the loaded viewer %j with one load', async (viewer, text) => {
    loadViewer.mockResolvedValue(viewer);

    const { container } = render(await ViewerActions());

    expect(loadViewer).toHaveBeenCalledTimes(1);
    if (text === null) {
      expect(container.innerHTML).toBe('');
    } else {
      expect(screen.getByText(text)).not.toBeNull();
    }
  });
});

describe('ViewerFallback', () => {
  it('holds the guest links inside <noscript> only', () => {
    const html = renderToStaticMarkup(<ViewerFallback />);

    expect(html.startsWith('<noscript>')).toBe(true);
    expect(html.endsWith('</noscript>')).toBe(true);
    expect(html).toContain('href="/auth?mode=sign-in"');
    expect(html).toContain('href="/auth?mode=sign-up"');
  });
});

describe('GuestActionsSizer', () => {
  afterEach(cleanup);

  it('copies the guest labels, hidden from everyone and not focusable', () => {
    const { container } = render(<GuestActionsSizer />);

    const sizer = container.firstElementChild;
    expect(sizer?.getAttribute('aria-hidden')).toBe('true');
    expect(sizer?.classList.contains('sh-sizer')).toBe(true);
    expect(sizer?.querySelector('a')).toBeNull();
    expect(sizer?.textContent).toBe('Sign inSign up');
    expect(sizer?.lastElementChild?.classList.contains('sh-only-desktop')).toBe(
      true,
    );
  });
});
