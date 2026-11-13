import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listEntries } from '../../src/home/fixtures';
import { parseSeasonRequest } from '../../src/browse/season';
import { generateMetadata, SeasonHead, SeasonResultsView } from './page';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/link', () => ({
  default: ({
    prefetch,
    ...props
  }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}));

// The results stream from an async Server Component, which jsdom cannot render: their states are
// covered by anime-grid.test.ts and anime-grid-view.test.tsx. The head and metadata are tested here.
const NOW = new Date('2026-11-13T12:00:00Z');

function renderHead(params: Record<string, string>) {
  return render(
    <SeasonHead season={parseSeasonRequest(params, NOW).season} now={NOW} />,
  );
}

function metadataFor(params: Record<string, string>) {
  return generateMetadata({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(params),
  });
}

describe('/season head', () => {
  afterEach(() => cleanup());

  it('shows the current season with both neighbours and no "This season" link', () => {
    renderHead({});

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Fall 2026 anime',
    );
    const previous = screen.getByRole('link', {
      name: 'Previous season: Summer 2026',
    });
    expect(previous.getAttribute('href')).toBe(
      '/season?season=summer&year=2026',
    );
    expect(previous.getAttribute('rel')).toBe('nofollow');
    expect(previous.dataset.prefetch).toBe('false');
    expect(
      screen
        .getByRole('link', { name: 'Next season: Winter 2027' })
        .getAttribute('href'),
    ).toBe('/season?season=winter&year=2027');
    expect(screen.queryByRole('link', { name: 'This season' })).toBeNull();
  });

  it('reads an old-site link and offers the way back to this season', () => {
    renderHead({ season: 'FALL', year: '2025', sort: 'score' });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Fall 2025 anime',
    );
    expect(
      screen.getByRole('link', { name: 'This season' }).getAttribute('href'),
    ).toBe('/season?season=fall&year=2026');
  });

  it('has no next link after Fall of next year and no previous before Winter 1917', () => {
    renderHead({ season: 'fall', year: '2027' });
    expect(screen.queryByRole('link', { name: /^Next season/ })).toBeNull();
    cleanup();

    renderHead({ season: 'winter', year: '1917' });
    expect(screen.queryByRole('link', { name: /^Previous season/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Next season: Spring 1917' }),
    ).toBeTruthy();
  });
});

describe('/season results', () => {
  afterEach(() => cleanup());

  function renderResults(
    params: Record<string, string>,
    state: Parameters<typeof SeasonResultsView>[0]['state'],
  ) {
    return render(
      <SeasonResultsView
        state={state}
        request={parseSeasonRequest(params, NOW)}
        now={NOW}
      />,
    );
  }

  it('says nothing is announced yet for the current season, with no link back', () => {
    renderResults({}, { kind: 'empty' });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Nothing announced for Fall 2026 yet',
    );
    expect(
      screen.queryByRole('link', { name: 'Back to this season' }),
    ).toBeNull();
  });

  it('says nothing is listed for a past season and links back to this one', () => {
    renderResults({ season: 'spring', year: '2001' }, { kind: 'empty' });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'No anime listed for Spring 2001',
    );
    expect(
      screen
        .getByRole('link', { name: 'Back to this season' })
        .getAttribute('href'),
    ).toBe('/season?season=fall&year=2026');
  });

  it('says nothing is announced yet for a future season', () => {
    renderResults({ season: 'winter', year: '2027' }, { kind: 'empty' });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Nothing announced for Winter 2027 yet',
    );
  });

  it('links "Show more" to the next page and retries the same page', () => {
    renderResults(
      { season: 'summer', year: '2025', page: '2' },
      { kind: 'loaded', entries: listEntries(2), more: 'available' },
    );
    expect(
      screen.getByRole('link', { name: 'Show more' }).getAttribute('href'),
    ).toBe('/season?season=summer&year=2025&page=3');
    cleanup();

    renderResults(
      { season: 'summer', year: '2025', page: '2' },
      { kind: 'failed', reason: 'unavailable' },
    );
    expect(
      screen.getByRole('link', { name: 'Try again' }).getAttribute('href'),
    ).toBe('/season?season=summer&year=2025&page=2');
  });
});

describe('/season metadata', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the season in the title, description and share cards', async () => {
    const metadata = await metadataFor({ season: 'spring', year: '2024' });

    expect(metadata.title).toBe('Spring 2024 anime');
    expect(metadata.description).toContain('Spring 2024');
    expect(metadata.alternates?.canonical).toBe(
      '/season?season=spring&year=2024',
    );
    expect(metadata.openGraph?.title).toBe('Spring 2024 anime');
    expect(metadata.twitter?.title).toBe('Spring 2024 anime');
  });

  it('falls back to the current season for a bad link', async () => {
    expect((await metadataFor({ season: 'fall', year: '0x7EA' })).title).toBe(
      'Fall 2026 anime',
    );
  });
});
