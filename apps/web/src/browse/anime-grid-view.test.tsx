import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listEntries, listEntry } from '../home/fixtures';
import type { AnimeGridState } from './anime-grid';
import { AnimeGridSkeleton, AnimeGridView } from './anime-grid-view';

// Exposes `prefetch` and `scroll`, which the real Link never renders.
vi.mock('next/link', () => ({
  default: ({
    prefetch,
    scroll,
    ...props
  }: ComponentProps<'a'> & { prefetch?: boolean; scroll?: boolean }) => (
    <a
      data-prefetch={String(prefetch)}
      data-scroll={String(scroll)}
      {...props}
    />
  ),
}));

const NEXT = '/season?season=fall&year=2026&page=2';
const RETRY = '/season?season=fall&year=2026';

function renderGrid(state: AnimeGridState) {
  return render(
    <AnimeGridView
      state={state}
      nextHref={NEXT}
      retryHref={RETRY}
      empty={<p>Nothing announced</p>}
    />,
  );
}

describe('AnimeGridView', () => {
  afterEach(() => cleanup());

  it('renders one h2 card per entry and a never-prefetched "Show more" that keeps the scroll', () => {
    renderGrid({ kind: 'loaded', entries: listEntries(3), more: 'available' });

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    const cards = within(screen.getByRole('list')).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/anime/anime-1',
      '/anime/anime-2',
      '/anime/anime-3',
    ]);
    const more = screen.getByRole('link', { name: 'Show more' });
    expect(more.getAttribute('href')).toBe(NEXT);
    expect(more.getAttribute('rel')).toBe('nofollow');
    expect(more.dataset.prefetch).toBe('false');
    expect(more.dataset.scroll).toBe('false');
  });

  it('shows no "Show more" at the end of the list', () => {
    renderGrid({ kind: 'loaded', entries: listEntries(1), more: 'end' });

    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says where the list stops when capped', () => {
    renderGrid({ kind: 'loaded', entries: listEntries(2), more: 'capped' });

    expect(screen.getByText('Showing the first 2.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull();
  });

  it('keeps the cards and offers a retry when loading more failed', () => {
    renderGrid({ kind: 'loaded', entries: listEntries(2), more: 'failed' });

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    const retry = within(screen.getByRole('status')).getByRole('link', {
      name: 'Retry loading more',
    });
    expect(retry.getAttribute('href')).toBe(RETRY);
    expect(retry.getAttribute('rel')).toBe('nofollow');
  });

  it('renders the given empty state', () => {
    renderGrid({ kind: 'empty' });

    expect(screen.getByText('Nothing announced')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it.each([
    ['busy', /Too many requests/],
    ['unavailable', /Something went wrong/],
  ] as const)(
    'shows a retry alert when the list failed (%s)',
    (reason, body) => {
      renderGrid({ kind: 'failed', reason });

      const alert = screen.getByRole('alert');
      expect(within(alert).getByText(body)).toBeTruthy();
      const retry = within(alert).getByRole('link', { name: 'Try again' });
      expect(retry.getAttribute('href')).toBe(RETRY);
      expect(retry.getAttribute('rel')).toBe('nofollow');
    },
  );

  it('keeps a very long title whole in the card heading', () => {
    const title =
      'That Time I Got Reincarnated as a Slime Season 3: The Long Subtitle That Never Ends';
    renderGrid({
      kind: 'loaded',
      entries: [listEntry({ titleEnglish: title })],
      more: 'end',
    });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title);
  });
});

describe('AnimeGridSkeleton', () => {
  afterEach(() => cleanup());

  it('announces the loading once and hides the 24 placeholders', () => {
    const { container } = render(<AnimeGridSkeleton label="Fall 2026" />);

    expect(screen.getByText('Loading Fall 2026')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const placeholders = container.querySelector('ul[aria-hidden="true"]');
    expect(placeholders?.querySelectorAll('.ol-skel')).toHaveLength(24);
  });
});
