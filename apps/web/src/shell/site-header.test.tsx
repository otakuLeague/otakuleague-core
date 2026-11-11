import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({ usePathname: () => '/leaderboard' }));

describe('SiteHeader', () => {
  afterEach(cleanup);

  it('links home and holds the main nav for the current path', () => {
    render(<SiteHeader />);

    const header = screen.getByRole('banner');
    expect(
      within(header)
        .getByRole('link', { name: 'OtakuLeague' })
        .getAttribute('href'),
    ).toBe('/');
    const nav = within(header).getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getByRole('link', { name: 'Leaderboard' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('submits the search as GET /search?q= without JavaScript', () => {
    render(<SiteHeader />);

    const form = screen.getByRole('search');
    expect(form.tagName).toBe('FORM');
    expect(form.getAttribute('action')).toBe('/search');
    expect(form.getAttribute('method')).toBe('get');
    const input = within(form).getByRole('searchbox', { name: 'Search anime' });
    expect(input.getAttribute('name')).toBe('q');
  });

  it('offers a guest Sign in and Sign up', () => {
    render(<SiteHeader />);

    expect(
      screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
    ).toBe('/auth?mode=sign-in');
    const signUp = screen.getByRole('link', { name: 'Sign up' });
    expect(signUp.getAttribute('href')).toBe('/auth?mode=sign-up');
    // Below 768 px only Sign in stays, until the mobile sheet (ADR 0014).
    expect(signUp.classList.contains('sh-only-desktop')).toBe(true);
  });
});
