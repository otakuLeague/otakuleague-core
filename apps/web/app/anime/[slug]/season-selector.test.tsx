import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonOption } from '../../../src/anime/tabs';
import { SeasonSelector } from './season-selector';

let pathname = '/anime/aot-season-2/episodes';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const base = { year: 2013, isCurrent: false, upcoming: false };
const SEASONS: readonly SeasonOption[] = [
  { ...base, anilistId: 1, slug: 'aot', label: 'Season 1' },
  {
    ...base,
    anilistId: 2,
    slug: 'aot-season-2',
    label: 'Season 2',
    year: 2017,
    isCurrent: true,
  },
  { ...base, anilistId: 3, slug: null, label: 'Season 3' },
  {
    ...base,
    anilistId: 4,
    slug: 'aot-final',
    label: 'The Final Chapters Part 3, a very long label',
    year: null,
    upcoming: true,
  },
];

function openSelector(): HTMLElement {
  render(<SeasonSelector slug="aot-season-2" seasons={SEASONS} />);
  const trigger = screen.getByRole('button', {
    name: 'Season: Season 2, 2017',
  });
  fireEvent.click(trigger);
  return trigger;
}
const link = (name: RegExp) => screen.getByRole('link', { name });

describe('SeasonSelector', () => {
  afterEach(() => {
    cleanup();
    pathname = '/anime/aot-season-2/episodes';
  });

  it('is closed by default and toggles on click', () => {
    render(<SeasonSelector slug="aot-season-2" seasons={SEASONS} />);
    const trigger = screen.getByRole('button', { name: /^Season: / });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.getElementById(trigger.getAttribute('aria-controls')!)?.hidden,
    ).toBe(true);
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Seasons' })).toBeTruthy();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    const trigger = openSelector();
    link(/Season 1/).focus();
    fireEvent.keyDown(link(/Season 1/), { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a click outside or when focus leaves it', () => {
    const trigger = openSelector();
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the current tab, Overview for an unknown path', () => {
    openSelector();
    expect(link(/Season 1/).getAttribute('href')).toBe('/anime/aot/episodes');
    cleanup();
    pathname = '/anime/aot-season-2/not-a-tab';
    openSelector();
    expect(link(/Season 1/).getAttribute('href')).toBe('/anime/aot');
  });

  it('marks the current and upcoming seasons, and lists one without a slug unlinked', () => {
    openSelector();
    expect(link(/Season 2/).getAttribute('aria-current')).toBe('true');
    expect(link(/Season 1/).hasAttribute('aria-current')).toBe(false);
    expect(link(/Final Chapters/).className).toContain(
      'ol-season__item--upcoming',
    );
    expect(link(/Final Chapters/).textContent).toContain('Upcoming');
    expect(screen.queryByRole('link', { name: /Season 3/ })).toBeNull();
    expect(screen.getByText('Season 3').getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
});
