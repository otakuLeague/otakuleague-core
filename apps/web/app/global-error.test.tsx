import { cleanup, fireEvent, render, within } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from './global-error';

// Own file: once another root has rendered into <body>, a root mounted on the document
// no longer receives clicks in jsdom, so this test needs a fresh document.
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('global error page', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('global-error.tsx reports a browser error, which has no digest', () => {
    const error = new Error('Cannot read properties of undefined');
    render(<GlobalError error={error} retry={vi.fn<() => void>()} />, {
      container: document,
    });

    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('global-error.tsx renders its own document with a generic message, never the error', () => {
    const retry = vi.fn<() => void>();
    const error = new Error('connect ECONNREFUSED 10.0.0.5:5432');
    error.stack =
      'Error: connect ECONNREFUSED\n    at Pool.connect (pg/lib/pool.js:45:11)';
    // It renders <html>, so it mounts on the document instead of a <div>.
    render(
      <GlobalError
        error={Object.assign(error, { digest: '1234567890' })}
        retry={retry}
      />,
      {
        container: document,
      },
    );

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Error | OtakuLeague');
    expect(
      within(document.body).getByRole('heading', { level: 1 }).textContent,
    ).toBe('Something went wrong');
    expect(document.body.textContent).not.toContain('ECONNREFUSED');
    expect(document.body.textContent).not.toContain('pool.js');
    expect(document.body.textContent).not.toContain('1234567890');

    fireEvent.click(
      within(document.body).getByRole('button', { name: 'Try again' }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
