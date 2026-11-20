import { cleanup, render, screen, within } from '@testing-library/react';
import { use } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './site-header';

const viewer = vi.hoisted(() => ({ suspends: false }));

vi.mock('next/navigation', () => ({ usePathname: () => '/leaderboard' }));
vi.mock('./viewer-actions', () => ({
  GuestActionsSizer: () => <div data-testid="sizer" />,
  ViewerActions: function ViewerActions() {
    if (viewer.suspends) use(new Promise<never>(() => {}));
    return <div data-testid="viewer-actions" />;
  },
  ViewerFallback: () => <div data-testid="viewer-fallback" />,
}));

describe('SiteHeader', () => {
  afterEach(() => {
    cleanup();
    viewer.suspends = false;
  });

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
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.getAttribute('maxlength')).toBe('100');
  });

  it('lays the viewer actions over the sizer in one cell', () => {
    const { container } = render(<SiteHeader />);

    const right = container.querySelector('.sh-right');
    expect(
      Array.from(right?.children ?? [], (child) =>
        child.getAttribute('data-testid'),
      ),
    ).toEqual(['sizer', 'viewer-actions']);
  });

  it('shows the fallback beside the sizer while the viewer streams', () => {
    viewer.suspends = true;
    const { container } = render(<SiteHeader />);

    const right = container.querySelector('.sh-right');
    expect(
      Array.from(right?.children ?? [], (child) =>
        child.getAttribute('data-testid'),
      ),
    ).toEqual(['sizer', 'viewer-fallback']);
  });
});
