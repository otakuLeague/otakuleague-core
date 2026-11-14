import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeGridState, GridMore } from './anime-grid';
import { AnimeGridView } from './anime-grid-view';
import { listEntries } from './fixtures';

// The real Link navigates on click; this one records the hrefs it would have followed.
let linkPending = false;
const followed: string[] = [];
vi.mock('next/link', () => ({
  default: ({
    prefetch,
    scroll,
    onClick,
    ...props
  }: ComponentProps<'a'> & { prefetch?: boolean; scroll?: boolean }) => (
    <a
      data-prefetch={String(prefetch)}
      data-scroll={String(scroll)}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) followed.push(String(props.href));
        event.preventDefault();
      }}
    />
  ),
  useLinkStatus: () => ({ pending: linkPending }),
}));

const NEXT = '/season?season=fall&year=2026&page=3';
const RETRY = '/season?season=fall&year=2026&page=2';

function grid(count: number, more: GridMore) {
  const state: AnimeGridState = {
    kind: 'loaded',
    entries: listEntries(count),
    more,
  };
  return (
    <AnimeGridView
      state={state}
      nextHref={NEXT}
      retryHref={RETRY}
      empty={null}
    />
  );
}

function cardLink(index: number): HTMLElement | null {
  return screen.getAllByRole('listitem')[index]?.querySelector('a') ?? null;
}

const showMore = () => screen.getByRole('link', { name: /Show more|Loading more…/ });

describe('Show more', () => {
  afterEach(() => {
    cleanup();
    linkPending = false;
    followed.length = 0;
  });

  it.each([24, 48])('moves no focus and is not busy on a first load of %i cards', (count) => {
    render(grid(count, 'available'));
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBeNull();
    expect(showMore().textContent).toBe('Show more');
    expect(showMore().getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('shows the pending state and ignores a second click while the page loads', () => {
    const { rerender } = render(grid(48, 'available'));
    fireEvent.click(showMore());
    linkPending = true;
    rerender(grid(48, 'available'));

    expect(showMore().textContent).toBe('Loading more…');
    expect(showMore().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true');
    fireEvent.click(showMore());
    expect(followed).toEqual([NEXT]);
  });

  it('focuses the first new card once the next page arrives', () => {
    const { rerender } = render(grid(48, 'available'));
    fireEvent.click(showMore());
    linkPending = true;
    rerender(grid(48, 'available'));
    linkPending = false;
    rerender(grid(96, 'available'));

    expect(document.activeElement).toBe(cardLink(48));
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBeNull();
    expect(showMore().textContent).toBe('Show more');
  });

  it('moves no focus when the list grows without a click', () => {
    const { rerender } = render(grid(48, 'available'));
    rerender(grid(72, 'available'));
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses the retry link when the next page failed', () => {
    const { rerender } = render(grid(48, 'available'));
    fireEvent.click(showMore());
    rerender(grid(48, 'failed'));
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Retry loading more' }),
    );
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBeNull();
  });

  it('focuses the first new card when the last page hits the cap', () => {
    const { rerender } = render(grid(216, 'available'));
    fireEvent.click(showMore());
    rerender(grid(240, 'capped'));
    expect(document.activeElement).toBe(cardLink(216));
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull();
    expect(screen.getByText('Showing the first 240.')).not.toBeNull();
  });

  it('focuses the first new card when the last page ends the list', () => {
    const { rerender } = render(grid(24, 'available'));
    fireEvent.click(showMore());
    rerender(grid(48, 'end'));
    expect(document.activeElement).toBe(cardLink(24));
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull();
  });
});
