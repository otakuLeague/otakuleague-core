import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Home from './page';

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
});
