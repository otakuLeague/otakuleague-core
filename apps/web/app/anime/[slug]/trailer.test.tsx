import type { AnimeDetails, AnimeTrailer } from '@otakuleague/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { animeFixture, sourced } from '../../../src/anime/fixtures';
import { overviewFacts } from '../../../src/anime/overview-facts';
import { Overview } from './overview';

const YOUTUBE: AnimeTrailer = { site: 'youtube', id: 'LHtdKWJdif4' };
const VIDEO_HOSTS = /youtube|ytimg|googlevideo|dailymotion|dmcdn/iu;

function facts(trailer: AnimeTrailer, overrides: Partial<AnimeDetails> = {}) {
  return overviewFacts(
    animeFixture({ trailer: sourced(trailer), ...overrides }),
  );
}

/** Every URL the page could fetch: iframes, scripts, images, link hints. */
function requestedUrls(root: ParentNode): string[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'iframe, script, img, link, source, video',
    ),
  ].flatMap((node) =>
    ['src', 'srcset', 'href'].map((name) => node.getAttribute(name) ?? ''),
  );
}

describe('TrailerPlayer', () => {
  afterEach(cleanup);

  it('loads nothing from the video host before a press', () => {
    const { container } = render(<Overview facts={facts(YOUTUBE)} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      requestedUrls(container).filter((url) => VIDEO_HOSTS.test(url)),
    ).toEqual([]);
    expect(requestedUrls(document.head)).toEqual([]);
    const html = renderToStaticMarkup(<Overview facts={facts(YOUTUBE)} />);
    expect(html).not.toContain('youtube-nocookie');
    expect(html).not.toMatch(/preconnect|dns-prefetch|<iframe|<script/u);
  });

  it('shows the poster, a play button and a plain watch link', () => {
    const { container } = render(<Overview facts={facts(YOUTUBE)} />);
    expect(
      container.querySelector('.ov-trailer')?.getAttribute('data-state'),
    ).toBe('poster');
    expect(
      screen.getByRole('button', { name: 'Play trailer (YouTube)' }),
    ).toBeTruthy();
    expect(
      container.querySelector('.ov-trailer img')?.getAttribute('src'),
    ).toContain('s4.anilist.co');
    const watch = screen.getByRole('link', { name: /Watch on YouTube/u });
    expect(watch.getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=LHtdKWJdif4',
    );
    expect(watch.getAttribute('target')).toBe('_blank');
    expect(watch.getAttribute('rel')).toBe('noopener noreferrer');
    // The host is named before the press, with the privacy notice one tap away.
    expect(screen.getByText(/Plays from YouTube/u)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Privacy' }).getAttribute('href'),
    ).toBe('/privacy#trailers');
  });

  it('swaps in the player on press, in the same box, and moves focus to it', () => {
    const { container } = render(<Overview facts={facts(YOUTUBE)} />);
    const box = container.querySelector('.ov-trailer');
    fireEvent.click(screen.getByRole('button', { name: /Play trailer/u }));
    const frame = container.querySelector('iframe');
    expect(container.querySelector('.ov-trailer')).toBe(box);
    expect(box?.getAttribute('data-state')).toBe('playing');
    expect(frame?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/LHtdKWJdif4?autoplay=1',
    );
    expect(frame?.getAttribute('title')).toBe(
      'Trailer: Attack on Titan (YouTube)',
    );
    expect(frame?.getAttribute('allow')).toBe(
      'autoplay; fullscreen; picture-in-picture',
    );
    expect(frame?.hasAttribute('allowfullscreen')).toBe(false);
    expect(frame?.getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(frame?.hasAttribute('sandbox')).toBe(false);
    expect(document.activeElement).toBe(frame);
    expect(screen.queryByRole('button', { name: /Play trailer/u })).toBeNull();
  });

  it('plays a Dailymotion trailer from its own embed', () => {
    const { container } = render(
      <Overview facts={facts({ site: 'dailymotion', id: 'x7tgad0' })} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Play trailer (Dailymotion)' }),
    );
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.dailymotion.com/embed/video/x7tgad0?autoplay=1',
    );
  });

  it('shows a plain panel without any image, and no section for a bad id', () => {
    const { container } = render(
      <Overview
        facts={facts(YOUTUBE, { bannerImageUrl: null, coverImageUrl: null })}
      />,
    );
    expect(container.querySelector('.ov-trailer img')).toBeNull();
    expect(screen.getByRole('button', { name: /Play trailer/u })).toBeTruthy();
    cleanup();

    render(<Overview facts={facts({ site: 'youtube', id: 'bad"id/../x' })} />);
    expect(screen.queryByRole('heading', { name: 'Trailer' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Watch on/u })).toBeNull();
  });
});
