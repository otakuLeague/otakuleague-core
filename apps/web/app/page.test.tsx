import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home, { metadata } from './page';

// HomeRow streams an async Server Component, which jsdom cannot render; HomeRowView is tested on
// its own. The Suspense fallbacks are checked by the build: `/` must stay Partial Prerender (ADR 0003).
vi.mock('./home-row', () => ({
  HomeRow: ({ row }: { readonly row: { readonly title: string } }) => (
    <h2>{row.title}</h2>
  ),
}));

describe('Home page', () => {
  afterEach(() => {
    cleanup();
  });

  it('leads with the hero heading', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Track every anime. Earn XP. Top the season.',
    );
  });

  it('links both calls to action to the auth page, like the header', () => {
    render(<Home />);

    expect(
      screen
        .getByRole('link', { name: 'Create your account' })
        .getAttribute('href'),
    ).toBe('/auth?mode=sign-up');
    expect(
      screen
        .getByRole('link', { name: 'I already have one' })
        .getAttribute('href'),
    ).toBe('/auth?mode=sign-in');
  });

  it('shows the three catalog rows in order', () => {
    render(<Home />);

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Trending now', 'This season', 'Top rated']);
  });

  it('is its own canonical', () => {
    expect(metadata.alternates?.canonical).toBe('/');
  });
});
