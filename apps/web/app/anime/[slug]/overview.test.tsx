import type { AnimeBySlug, AnimeDetails } from '@otakuleague/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../src/api/client';
import { loadAnime } from '../../../src/anime/data';
import { animeFixture, sourced } from '../../../src/anime/fixtures';
import { overviewFacts } from '../../../src/anime/overview-facts';
import { Overview, OverviewLoader } from './overview';

vi.mock('../../../src/anime/data', () => ({ loadAnime: vi.fn() }));

function renderOverview(overrides: Partial<AnimeDetails> = {}) {
  return render(<Overview facts={overviewFacts(animeFixture(overrides))} />);
}

const LONG = `${'Gold Roger was the Pirate King. '.repeat(15)}\n\nEnter Monkey D. Luffy.\n\n(Source: Anime News Network)`;

describe('Overview', () => {
  afterEach(cleanup);

  it('renders the synopsis, details and genres of a finished anime', () => {
    const { container } = renderOverview();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Synopsis' }),
    ).toBeTruthy();
    expect(screen.getByText('Humanity lives behind walls.')).toBeTruthy();
    const facts = [
      ...container.querySelectorAll('.ov-facts dt, .ov-facts dd'),
    ].map((node) => node.textContent);
    expect(facts).toEqual([
      'Format',
      'TV',
      'Episodes',
      '25 × 24 min',
      'Aired',
      '7 Apr 2013 – 29 Sep 2013',
      'Season',
      'Spring 2013',
      'Studio',
      'Wit Studio',
    ]);
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2013-04-07',
    );
    expect(
      screen.getByRole('complementary', { name: 'Key facts' }),
    ).toBeTruthy();
    const genres = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(genres).toEqual(['Action', 'Drama']);
    // Genre browse routes don't exist yet: plain chips.
    expect(container.querySelector('.ov-chips a')).toBeNull();
  });

  it('keeps the section with an empty box when there is no synopsis', () => {
    renderOverview({ synopsis: null });
    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeTruthy();
    expect(screen.getByText('No synopsis yet.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a short synopsis whole, without a toggle', () => {
    const { container } = renderOverview({
      synopsis: sourced('Short. (Source: ANN)'),
    });
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.ov-syn')?.hasAttribute('data-state')).toBe(
      false,
    );
    expect(screen.getByText('Source: ANN')).toBeTruthy();
  });

  it('collapses a long synopsis and toggles it with Read more / Show less', () => {
    const { container } = renderOverview({ synopsis: sourced(LONG) });
    const text = container.querySelector('.ov-syn');
    const button = screen.getByRole('button', { name: 'Read more' });
    expect(text?.getAttribute('data-state')).toBe('collapsed');
    expect(text?.classList.contains('ov-syn--clamp')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(text?.id);
    // Every paragraph stays in the DOM (screen readers, find in page); CSS clamps them.
    expect(text?.querySelectorAll('p')).toHaveLength(2);
    expect(text?.textContent).not.toContain('Source:');
    expect(screen.getByText('Source: Anime News Network')).toBeTruthy();

    fireEvent.click(button);
    expect(text?.getAttribute('data-state')).toBe('expanded');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('Show less');

    fireEvent.click(button);
    expect(button.textContent).toBe('Read more');
  });

  it('shows episodes so far and an open end while airing', () => {
    const { container } = renderOverview({
      status: sourced('RELEASING'),
      episodes: null,
      endDate: null,
      nextEpisode: sourced({ episode: 1181, airingAt: '2026-11-15T00:00:00Z' }),
      startDate: sourced({ year: 1999, month: 10, day: 20 }),
    });
    expect(screen.getByText('1180 so far × 24 min')).toBeTruthy();
    const aired = [...container.querySelectorAll('.ov-facts dd')].find((dd) =>
      dd.textContent?.includes('1999'),
    );
    expect(aired?.textContent).toBe('20 Oct 1999 – now');
  });

  it('hides empty rows, and the whole card when every fact is missing', () => {
    renderOverview({ format: null, season: null, genres: null });
    expect(screen.queryByText('Format')).toBeNull();
    expect(screen.queryByText('Genres')).toBeNull();
    expect(screen.getByText('Episodes')).toBeTruthy();
    cleanup();

    const { container } = renderOverview({
      format: null,
      episodes: null,
      durationMinutes: null,
      startDate: null,
      season: null,
      studios: null,
      genres: null,
    });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(container.querySelector('.ov-grid--single')).toBeTruthy();
  });

  it('keeps a long unbroken synopsis whole in the DOM and shows up to 20 genres', () => {
    const genres = Array.from({ length: 25 }, (_, i) => `Genre ${i}`);
    const { container } = renderOverview({
      synopsis: sourced('x'.repeat(2000)),
      genres: sourced(genres),
    });
    expect(screen.getByRole('button', { name: 'Read more' })).toBeTruthy();
    expect(container.querySelector('.ov-syn')?.textContent).toHaveLength(2000);
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('collapses a short first paragraph to itself, without the clamp', () => {
    const { container } = renderOverview({
      synopsis: sourced('Short opener.\n\nThe rest of the story.'),
    });
    const text = container.querySelector('.ov-syn');
    expect(text?.getAttribute('data-state')).toBe('collapsed');
    expect(text?.classList.contains('ov-syn--clamp')).toBe(false);
    expect(screen.getByRole('button', { name: 'Read more' })).toBeTruthy();
  });

  it('un-collapses the synopsis and hides the toggle without JS', () => {
    const html = renderToStaticMarkup(
      <Overview
        facts={overviewFacts(animeFixture({ synopsis: sourced(LONG) }))}
      />,
    );
    expect(html).toMatch(
      /<noscript><style>[^<]*\.ov-syn-toggle\{display:none/u,
    );
  });

  it('shows the premiere date of a not yet released anime', () => {
    renderOverview({ status: sourced('NOT_YET_RELEASED'), endDate: null });
    expect(screen.getByText('Premieres')).toBeTruthy();
    expect(screen.queryByText('Aired')).toBeNull();
  });

  it('shows the empty box for a synopsis from MyAnimeList (OTA-127)', () => {
    renderOverview({
      synopsis: { ...sourced('From MyAnimeList.'), source: 'jikan' },
    });
    expect(screen.getByText('No synopsis yet.')).toBeTruthy();
    expect(screen.queryByText('From MyAnimeList.')).toBeNull();
  });

  it('renders HTML in a synopsis as text, never as elements', () => {
    const hostile =
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(1)">x</a>';
    const { container } = renderOverview({ synopsis: sourced(hostile) });
    const text = container.querySelector('.ov-syn');
    expect(container.querySelector('script, img, a')).toBeNull();
    expect(text?.textContent).toContain('<script>alert(1)</script>');
    expect(text?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(text?.textContent).toContain('<a href="javascript:alert(1)">x</a>');
  });
});

describe('OverviewLoader', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadAnime).mockReset();
  });

  async function renderLoader(result: ApiResult<AnimeBySlug>) {
    vi.mocked(loadAnime).mockResolvedValueOnce(result);
    return render(<>{await OverviewLoader({ slug: 'attack-on-titan' })}</>);
  }

  it('renders the overview from the cached anime', async () => {
    await renderLoader({
      ok: true,
      data: { kind: 'anime', anime: animeFixture() },
    });
    expect(loadAnime).toHaveBeenCalledWith('attack-on-titan');
    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeTruthy();
  });

  it('renders nothing on failure or redirect: the header owns those states', async () => {
    const failed = await renderLoader({
      ok: false,
      failure: { kind: 'timeout' },
    });
    expect(failed.container.innerHTML).toBe('');
    cleanup();
    const moved = await renderLoader({
      ok: true,
      data: { kind: 'redirect', canonicalSlug: 'shingeki' },
    });
    expect(moved.container.innerHTML).toBe('');
  });
});
