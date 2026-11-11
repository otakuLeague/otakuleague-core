import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderNav, HeaderNavView } from './header-nav';
import { DISCOVER_LINKS, MAIN_LINKS } from './nav';

let pathname = '/season/2026';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function currentLinks() {
  return screen
    .getAllByRole('link', { hidden: true })
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.getAttribute('href'));
}

const discoverSummary = () => screen.getByText('Discover').closest('summary');

describe('HeaderNavView', () => {
  afterEach(cleanup);

  it('lists every section with nothing active in the prerendered fallback', () => {
    render(<HeaderNavView pathname={null} />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link', { hidden: true })
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      ...DISCOVER_LINKS.map((link) => link.href),
      ...MAIN_LINKS.map((link) => link.href),
    ]);
    expect(currentLinks()).toEqual([]);
    expect(discoverSummary()?.hasAttribute('data-active')).toBe(false);
  });

  it('marks the current section link', () => {
    render(<HeaderNavView pathname="/top/anime" />);

    expect(currentLinks()).toEqual(['/top/anime']);
    expect(discoverSummary()?.hasAttribute('data-active')).toBe(false);
  });

  it('marks Discover visually and its current list for assistive tech', () => {
    render(<HeaderNavView pathname="/discover/completed" />);

    expect(discoverSummary()?.hasAttribute('data-active')).toBe(true);
    expect(currentLinks()).toEqual(['/discover/completed']);
  });

  it('marks nothing outside the sections', () => {
    render(<HeaderNavView pathname="/anime/frieren" />);

    expect(currentLinks()).toEqual([]);
  });

  it('shows each Discover list with its hint', () => {
    render(<HeaderNavView pathname={null} />);

    for (const link of DISCOVER_LINKS) {
      expect(
        screen
          .getByRole('link', {
            name: `${link.label}${link.hint}`,
            hidden: true,
          })
          .getAttribute('href'),
      ).toBe(link.href);
    }
  });
});

describe('HeaderNav', () => {
  afterEach(cleanup);

  it('reads the current path', () => {
    pathname = '/season/2026';
    render(<HeaderNav />);

    expect(currentLinks()).toEqual(['/season']);
  });
});
