import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonOption } from '../../../src/anime/tabs';
import { SeasonSelector } from './season-selector';

let pathname = '/anime/aot-season-2/episodes';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const base = { year: 2013, isCurrent: false, upcoming: false, imported: true };
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
  { ...base, anilistId: 3, slug: null, imported: false, label: 'Season 3' },
  {
    ...base,
    anilistId: 5,
    slug: 'aot-junior-high',
    imported: false,
    label: 'Season 5 (claimed)',
  },
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

  it('marks the current and upcoming seasons', () => {
    openSelector();
    expect(link(/Season 2/).getAttribute('aria-current')).toBe('true');
    expect(link(/Season 1/).hasAttribute('aria-current')).toBe(false);
    expect(link(/Final Chapters/).className).toContain(
      'ol-season__item--upcoming',
    );
    expect(link(/Final Chapters/).textContent).toContain('Upcoming');
  });

  it('links every season: imported ones to their page, others through their AniList id', () => {
    openSelector();
    expect(link(/Season 1/).getAttribute('href')).toBe('/anime/aot/episodes');
    expect(link(/Season 1/).hasAttribute('rel')).toBe(false);
    const notImported = link(/^Season 3/);
    expect(notImported.getAttribute('href')).toBe('/anime/anilist/3/episodes');
    expect(notImported.getAttribute('rel')).toBe('nofollow');
    // A claimed slug is not a page yet (OTA-190): still the id route.
    const claimed = link(/Season 5/);
    expect(claimed.getAttribute('href')).toBe('/anime/anilist/5/episodes');
    expect(claimed.getAttribute('rel')).toBe('nofollow');
    expect(screen.getAllByRole('link')).toHaveLength(SEASONS.length);
    expect(document.querySelector('[aria-disabled]')).toBeNull();
  });

  it('names the trigger "Seasons" when the current entry is not in the main line', () => {
    const others = SEASONS.map((season) => ({ ...season, isCurrent: false }));
    render(<SeasonSelector slug="aot-season-2" seasons={others} />);
    expect(screen.getByRole('button', { name: 'Seasons' })).toBeTruthy();
  });

  it('stays open while focus moves inside, and closes once a season is picked', () => {
    const trigger = openSelector();
    fireEvent.blur(trigger, { relatedTarget: link(/Season 1/) });
    fireEvent.pointerDown(link(/Season 1/));
    fireEvent.blur(trigger, { relatedTarget: null });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(link(/Season 1/));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape wherever focus is, and on a blur to nowhere', () => {
    const trigger = openSelector();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.blur(trigger, { relatedTarget: null });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
