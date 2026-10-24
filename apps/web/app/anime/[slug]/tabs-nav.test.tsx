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
});
