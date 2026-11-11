import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TabsNav } from './tabs-nav';

const pathname = vi.fn(() => '/anime/frieren/cast');
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

describe('TabsNav', () => {
  afterEach(() => cleanup());

  it('lists the seven tabs as links and marks the open one as the current page', () => {
    render(<TabsNav slug="frieren" />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Overview',
      'Episodes',
      'Cast & Crew',
      'Music',
      'Related & Media',
      'Stats',
      'Community',
    ]);
    expect(
      links
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent),
    ).toEqual(['Cast & Crew']);
    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe(
      'Anime sections',
    );
  });

  it('marks Overview on the bare slug', () => {
    pathname.mockReturnValueOnce('/anime/frieren');
    render(<TabsNav slug="frieren" />);

    expect(
      screen
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('renders the sticky bar pills with their own class names', () => {
    pathname.mockReturnValueOnce('/anime/frieren/music');
    render(<TabsNav slug="frieren" variant="pills" />);

    expect(screen.getByRole('navigation').className).toBe('anime-pills');
    // Its own landmark name: both navs are on the page while the bar shows.
    expect(
      screen.getByRole('navigation', { name: 'Anime sections, sticky bar' }),
    ).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(links.every((link) => link.className === 'anime-pill')).toBe(true);
    expect(
      links
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent),
    ).toEqual(['Music']);
  });

  it('marks no tab on a path that is not one of its tabs', () => {
    pathname.mockReturnValueOnce('/anime/frieren-2/cast');
    render(<TabsNav slug="frieren" />);

    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.hasAttribute('aria-current')),
    ).toEqual([]);
  });
});
