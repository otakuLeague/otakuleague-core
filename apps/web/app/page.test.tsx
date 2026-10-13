import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

// HealthStatus is an async Server Component, which jsdom cannot render; it is tested on its own.
// The Suspense fallback is checked by the build: `/` must stay Partial Prerender (ADR 0003).
vi.mock('./health-status', () => ({
  HealthStatus: () => <p>mocked status</p>,
}));

describe('Home page', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the app name from shared-types as the level-1 heading', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'OtakuLeague',
    );
  });

  it('renders the health status under the service status heading', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Service status',
    );
    expect(screen.getByRole('status').textContent).toBe('mocked status');
  });
});
