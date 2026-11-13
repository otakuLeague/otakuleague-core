import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { listEntry } from '../src/home/fixtures';
import type { HomeRowDefinition } from '../src/home/home-rows';
import { HomeRowSkeleton, HomeRowView } from './home-row';

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

  it('renders one linked card per entry with a decorative cover', () => {
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

    const cards = within(screen.getByRole('list', { name: row.title }))
      .getAllByRole('link')
      .map((link) => [link.getAttribute('href'), link.getAttribute('rel')]);
    expect(cards).toEqual([
      ['/anime/frieren-beyond-journeys-end', null],
      ['/anime/anilist/2', 'nofollow'],
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

  it('reports a failed row as an alert naming the row, without the API message', () => {
    render(
      <HomeRowView
        row={row}
        state={{ kind: 'failed', failure: { kind: 'timeout' } }}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      "Trending now didn't load. The rest of the page is fine. Reload to try again.",
    );
  });
});

describe('HomeRowSkeleton', () => {
  afterEach(() => cleanup());

  it('is a busy list of eight cover placeholders', () => {
    render(<HomeRowSkeleton />);

    const list = screen.getByRole('list');
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
  });
});
