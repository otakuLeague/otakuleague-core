import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listEntry } from '../src/home/fixtures';
import type { HomeRowDefinition } from '../src/home/home-rows';
import { HomeRowSkeleton, HomeRowView } from './home-row';

// Exposes `prefetch`, which the real Link never renders.
vi.mock('next/link', () => ({
  default: ({ prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}));

const row: HomeRowDefinition = {
  id: 'trending',
  kind: 'airing',
  title: 'Trending now',
  subtitle: 'Popular shows airing now',
  href: '/discover/airing',
  linkLabel: 'See all',
};

describe('HomeRowView', () => {
  afterEach(() => cleanup());

  it('renders one nofollow, never-prefetched card per entry with a decorative cover', () => {
    const { container } = render(
      <HomeRowView
        row={row}
        state={{
          kind: 'loaded',
          entries: [
            listEntry(),
            listEntry({ anilistId: 2, slug: null, coverImageUrl: null }),
          ],
        }}
      />,
    );

    const cards = within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((link) => [
        link.getAttribute('href'),
        link.getAttribute('rel'),
        link.dataset.prefetch,
      ]);
    expect(cards).toEqual([
      ['/anime/frieren-beyond-journeys-end', 'nofollow', 'false'],
      ['/anime/anilist/2', 'nofollow', 'false'],
    ]);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Frieren: Beyond Journey's End", "Frieren: Beyond Journey's End"]);
    // One cover image: the entry without a cover keeps its empty frame.
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('alt')).toBe('');
  });

  it('keeps a very long title as text for the CSS two-line clamp', () => {
    const long = 'Isekai '.repeat(40).trim();
    render(
      <HomeRowView
        row={row}
        state={{ kind: 'loaded', entries: [listEntry({ titleEnglish: long })] }}
      />,
    );
    const title = screen.getByRole('heading', { level: 3 });
    expect(title.textContent).toBe(long);
    expect(title.className).toBe('ol-anime-card__title');
  });

  it('says the list is empty and links the full list', () => {
    render(<HomeRowView row={row} state={{ kind: 'empty' }} />);

    expect(screen.getByText('Nothing here yet')).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: 'Open the full list' })
        .getAttribute('href'),
    ).toBe(row.href);
  });

  it('reports a failed row as a status naming the row', () => {
    render(
      <HomeRowView
        row={row}
        state={{ kind: 'failed' }}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe(
      "Trending now didn't load. The rest of the page is fine. Reload to try again.",
    );
  });
});

describe('HomeRowSkeleton', () => {
  afterEach(() => cleanup());

  it('announces the row once and hides its eight placeholders', () => {
    const { container } = render(<HomeRowSkeleton title="Top rated" />);

    expect(screen.getByText('Loading Top rated')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
    const list = container.querySelector('ul');
    expect(list?.getAttribute('aria-hidden')).toBe('true');
    expect(list?.children).toHaveLength(8);
  });
});
