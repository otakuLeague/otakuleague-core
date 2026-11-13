import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSeasonRequest } from '../../src/browse/season';
import { generateMetadata, SeasonHead } from './page';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/link', () => ({
  default: ({ prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
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
    expect(previous.getAttribute('href')).toBe('/season?season=summer&year=2026');
    expect(previous.getAttribute('rel')).toBe('nofollow');
    expect(previous.dataset.prefetch).toBe('false');
    expect(
      screen.getByRole('link', { name: 'Next season: Winter 2027' }).getAttribute('href'),
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
    expect(metadata.alternates?.canonical).toBe('/season?season=spring&year=2024');
    expect(metadata.openGraph?.title).toBe('Spring 2024 anime');
    expect(metadata.twitter?.title).toBe('Spring 2024 anime');
  });

  it('falls back to the current season for a bad link', async () => {
    expect((await metadataFor({ season: 'fall', year: '0x7EA' })).title).toBe(
      'Fall 2026 anime',
    );
  });
});
