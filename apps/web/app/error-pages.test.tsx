import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from './error';
import NotFound from './not-found';

function internalError(): Error & { digest: string } {
  const error = new Error('connect ECONNREFUSED 10.0.0.5:5432');
  error.stack =
    'Error: connect ECONNREFUSED\n    at Pool.connect (pg/lib/pool.js:45:11)';
  return Object.assign(error, { digest: '1234567890' });
}

function expectNoInternals(text: string | null): void {
  expect(text).not.toContain('ECONNREFUSED');
  expect(text).not.toContain('pool.js');
  expect(text).not.toContain('1234567890');
}

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('error pages', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('error.tsx shows a generic message and retries on click, never the error', () => {
    const retry = vi.fn<() => void>();
    render(<ErrorPage error={internalError()} retry={retry} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Something went wrong',
    );
    expect(
      screen.getByRole('link', { name: 'Back to home' }).getAttribute('href'),
    ).toBe('/');
    expectNoInternals(document.body.textContent);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('error.tsx reports a browser error, which has no digest', () => {
    const error = new Error('Cannot read properties of undefined');
    render(<ErrorPage error={error} retry={vi.fn<() => void>()} />);

    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('error.tsx does not report a server error again: the server already did', () => {
    render(<ErrorPage error={internalError()} retry={vi.fn<() => void>()} />);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('not-found.tsx explains the page is missing and links home', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Page not found',
    );
    expect(
      screen.getByRole('link', { name: 'Back to home' }).getAttribute('href'),
    ).toBe('/');
  });
});
