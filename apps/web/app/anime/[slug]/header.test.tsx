import type {
  AnimeBySlug,
  AnimeDetails,
  AnimeFranchise,
} from '@otakuleague/shared-types';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../src/api/client';
import { accentPalette } from '../../../src/anime/accent';
import { loadAnime, loadFranchise } from '../../../src/anime/data';
import {
  animeFixture,
  franchiseFixture,
  franchiseSeason,
  sourced,
} from '../../../src/anime/fixtures';
import { headerFacts } from '../../../src/anime/header-facts';
import { AnimeHeader, AnimeHeaderLoader, SeasonSelectorLoader } from './header';

vi.mock('../../../src/anime/data', () => ({
  loadAnime: vi.fn(),
  loadFranchise: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/anime/attack-on-titan',
}));

/** The sticky bar's observer: tests call `scrollPastHeader` to fire it. */
let observed: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null =
  null;
let observedOptions: IntersectionObserverInit | undefined;
class FakeIntersectionObserver {
  constructor(
    callback: (entries: Partial<IntersectionObserverEntry>[]) => void,
    options?: IntersectionObserverInit,
  ) {
    observed = callback;
    observedOptions = options;
  }
  observe() {}
  disconnect() {}
}

function renderHeader(overrides: Partial<AnimeDetails> = {}) {
  const anime = animeFixture(overrides);
  return render(
    <div className="anime-page">
      <AnimeHeader
        facts={headerFacts(anime)}
        coverColor={anime.coverColor?.value ?? null}
        slug="attack-on-titan"
      />
    </div>,
  );
}

const hero = () => within(document.getElementById('anime-hero')!);

describe('AnimeHeader', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    observed = null;
  });

  it('shows the full header of a finished anime', () => {
    renderHeader();
    const header = hero();
    expect(header.getByRole('heading', { level: 1 }).textContent).toBe(
      'Attack on Titan',
    );
    expect(header.getByText('進撃の巨人 · Shingeki no Kyojin')).toBeTruthy();
    expect(
      header.getByRole('link', { name: 'Hajime Isayama' }).getAttribute('href'),
    ).toBe('#');
    expect(header.getByRole('link', { name: 'Wit Studio' })).toBeTruthy();
    expect(header.queryByText('Pony Canyon')).toBeNull();
    expect(
      header.getByRole('img', { name: 'Attack on Titan cover' }),
    ).toBeTruthy();
    expect(header.getByText('TV')).toBeTruthy();
    expect(header.getByRole('link', { name: 'Spring 2013' })).toBeTruthy();
    expect(header.getByText('25 eps · 24m')).toBeTruthy();
    expect(header.getByRole('button', { name: /Add to List/ })).toBeTruthy();
    expect(
      header.getByRole('button', { name: /Add to Favourites/ }),
    ).toBeTruthy();
    expect(header.queryByRole('timer')).toBeNull();
  });

  it('fills the stats card with the score, per-format ranks, members and favourites', () => {
    renderHeader();
    const stats = within(document.querySelector('.anime-stats') as HTMLElement);
    expect(stats.getByText('#69 highest rated TV')).toBeTruthy();
    expect(stats.getByText('#1 most popular TV')).toBeTruthy();
    expect(stats.getByText('812.3K')).toBeTruthy();
    expect(stats.getByText('110.4K')).toBeTruthy();
    expect(document.querySelector('.anime-stat--score')?.textContent).toContain(
      '85%',
    );
  });

  it.each([
    ['RELEASING', 'Airing', 'airing'],
    ['FINISHED', 'Finished', 'finished'],
    ['NOT_YET_RELEASED', 'Not yet aired', 'upcoming'],
    ['HIATUS', 'On hiatus', 'hiatus'],
    ['CANCELLED', 'Cancelled', 'cancelled'],
  ] as const)(
    'colours the %s status chip and pulses only while airing',
    (status, label, key) => {
      renderHeader({ status: sourced(status) });
      const chip = hero().getByText(label);
      expect(chip.getAttribute('style')).toContain(`var(--status-${key})`);
      expect(chip.querySelector('.anime-chip__dot--pulse') !== null).toBe(
        key === 'airing',
      );
    },
  );

  it.each([
    ['WINTER', 'Winter 2013', 'winter'],
    ['SUMMER', 'Summer 2013', 'summer'],
    ['FALL', 'Fall 2013', 'fall'],
  ] as const)('colours the %s season chip', (season, label, key) => {
    renderHeader({ season: sourced(season) });
    expect(
      hero().getByRole('link', { name: label }).getAttribute('style'),
    ).toContain(`var(--season-${key})`);
  });

  it('shows initials on a placeholder when AniList has no images', () => {
    renderHeader({ coverImageUrl: null, bannerImageUrl: null });
    const placeholder = hero().getByRole('img', { name: 'No cover available' });
    expect(placeholder.textContent).toBe('AT');
    expect(document.querySelector('img')).toBeNull();
  });

  it('hides every value AniList does not give: no 0, no #null, no empty card', () => {
    renderHeader({
      rankRated: null,
      rankPopular: null,
      scores: [],
      favourites: null,
      creators: null,
      studios: sourced([]),
    });
    const text = document.getElementById('anime-hero')!.textContent ?? '';
    expect(text).not.toMatch(/#|null|undefined|NaN/);
    expect(text).not.toMatch(/\b0\b/);
    expect(document.querySelector('.anime-stats')).toBeNull();
    expect(document.querySelector('.anime-hero__credits')).toBeNull();
  });

  it('keeps the score with a "Score" caption when there is no rank', () => {
    renderHeader({ rankRated: null });
    expect(document.querySelector('.anime-stat--score')?.textContent).toBe(
      'Score85%',
    );
  });

  describe('countdown', () => {
    const airing = (airingAt: string) => ({
      status: sourced('RELEASING' as const),
      nextEpisode: sourced({ episode: 8, airingAt }),
    });

    it('counts down live and reads "Episode 8 aired" at zero', () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(new Date('2026-10-26T14:58:58.000Z'));
      renderHeader(airing('2026-10-26T15:00:00.000Z'));
      expect(screen.getByRole('timer').textContent).toBe(
        'Next episodeEp 8 · 01m 02s',
      );

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole('timer').textContent).toBe(
        'Next episodeEp 8 · 00m 02s',
      );

      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('Episode 8 aired');
    });

    it('reads "aired" at once when the cached date has passed', () => {
      renderHeader(airing('2020-01-01T00:00:00.000Z'));
      expect(screen.getByText('Episode 8 aired')).toBeTruthy();
    });

    it("gives the airing time in the visitor's time zone", () => {
      const savedZone = process.env.TZ;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-24T00:00:00.000Z'));
      try {
        // Monday 15:00 UTC: already Tuesday in Tokyo, still Monday morning in Los Angeles.
        process.env.TZ = 'Asia/Tokyo';
        renderHeader(airing('2026-10-26T15:00:00.000Z'));
        const tokyo = screen.getByRole('timer').getAttribute('title') ?? '';
        expect(tokyo).toMatch(/27/);
        expect(tokyo).toMatch(/GMT\+9|JST/);
        cleanup();

        process.env.TZ = 'America/Los_Angeles';
        renderHeader(airing('2026-10-26T15:00:00.000Z'));
        const losAngeles =
          screen.getByRole('timer').getAttribute('title') ?? '';
        expect(losAngeles).toMatch(/26/);
        expect(losAngeles).toMatch(/PDT|GMT-7/);
      } finally {
        if (savedZone === undefined) delete process.env.TZ;
        else process.env.TZ = savedZone;
      }
    });

    it('never shows NaN for an airing time it cannot parse', () => {
      renderHeader(airing('not a date'));
      const text = document.getElementById('anime-hero')!.textContent ?? '';
      expect(text).not.toMatch(/NaN|Invalid|aired/);
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('is not shown for an anime that is not airing', () => {
      renderHeader({
        ...airing('2099-01-01T00:00:00.000Z'),
        status: sourced('HIATUS'),
      });
      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.queryByText(/aired/)).toBeNull();
    });
  });

  it('sets the accent from the cover colour, teal when it is missing', () => {
    renderHeader();
    expect(document.querySelector('style')?.textContent).toContain(
      '--accent: #e4a15d;',
    );
    cleanup();
    renderHeader({ coverColor: null });
    expect(document.querySelector('style')?.textContent).toContain(
      '--accent: #4fd1b5;',
    );
  });

  it('writes an upper-case cover colour in lower case and gives each theme its ink', () => {
    renderHeader({ coverColor: sourced('#5D1A8B') });
    const palette = accentPalette('#5d1a8b');
    const style = document.querySelector('style')?.textContent ?? '';
    expect(style).not.toContain('#5D1A8B');
    expect(style).toContain(`--accent: ${palette.accent};`);
    expect(style).toContain(`--on-accent: ${palette.onAccent};`);
    expect(style).toContain(
      `.anime-page { --accent: ${palette.accent}; --on-accent: ${palette.onAccent}; --accent-ink: ${palette.inkDark}; }`,
    );
    expect(
      style.match(new RegExp(`--accent-ink: ${palette.inkLight};`, 'g')),
    ).toHaveLength(2);
  });

  it('never writes a malformed cover colour into the style', () => {
    renderHeader({ coverColor: sourced('#4fd1b5;} body { display: none') });
    const style = document.querySelector('style')?.textContent ?? '';
    expect(style).not.toContain('display');
    expect(style).toContain('--accent: #4fd1b5;');
  });

  it('hides the sticky bar chips AniList does not give', () => {
    renderHeader({
      coverImageUrl: null,
      status: null,
      format: null,
      season: null,
      episodes: null,
      scores: [],
      rankRated: null,
      rankPopular: null,
      favourites: null,
    });
    const sticky = screen.getByTestId('anime-sticky');
    expect(sticky.querySelector('.anime-sticky__chips')?.children).toHaveLength(
      0,
    );
    // The mini placeholder is decorative (aria-hidden) and blank.
    expect(within(sticky).queryByRole('img')).toBeNull();
    expect(sticky.querySelector('.anime-cover--empty')?.textContent).toBe('');
    const text = sticky.querySelector('.anime-sticky__titles')?.textContent;
    expect(text).toBe('Attack on Titan');
  });

  it('titles the sticky bar rank chip with only the ranks AniList gives', () => {
    renderHeader({ rankRated: null });
    const chip = within(screen.getByTestId('anime-sticky')).getByText('#1');
    expect(chip.getAttribute('title')).toBe('#1 most popular TV');
  });

  it('slides the sticky bar in once the header has scrolled out of view', () => {
    renderHeader();
    const sticky = screen.getByTestId('anime-sticky');
    expect(sticky.className).not.toContain('anime-sticky--shown');
    expect(sticky.hasAttribute('inert')).toBe(true);

    act(() =>
      observed?.([
        {
          isIntersecting: false,
          boundingClientRect: { bottom: -10 } as DOMRect,
        },
      ]),
    );
    expect(sticky.className).toContain('anime-sticky--shown');
    expect(sticky.hasAttribute('inert')).toBe(false);
    expect(
      within(sticky)
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(within(sticky).getByText('#69 · #1')).toBeTruthy();

    act(() =>
      observed?.([
        {
          isIntersecting: true,
          boundingClientRect: { bottom: 300 } as DOMRect,
        },
      ]),
    );
    expect(sticky.className).not.toContain('anime-sticky--shown');
  });

  it('counts the hero as gone once it is under the global header', () => {
    document.documentElement.style.setProperty('--header-h', '64px');
    renderHeader();
    const sticky = screen.getByTestId('anime-sticky');
    expect(observedOptions?.rootMargin).toBe('-64px 0px 0px 0px');

    act(() =>
      observed?.([
        {
          isIntersecting: false,
          boundingClientRect: { bottom: 40 } as DOMRect,
          rootBounds: { top: 64 } as DOMRect,
        },
      ]),
    );
    expect(sticky.className).toContain('anime-sticky--shown');
    document.documentElement.style.removeProperty('--header-h');
  });
});

describe('AnimeHeaderLoader', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(loadAnime).mockReset();
    vi.mocked(loadFranchise).mockReset();
    vi.unstubAllGlobals();
  });

  async function renderLoader(result: ApiResult<AnimeBySlug>) {
    vi.mocked(loadAnime).mockResolvedValueOnce(result);
    // The franchise never answers: the header must not wait for it.
    vi.mocked(loadFranchise).mockReturnValue(new Promise(() => {}));
    render(await AnimeHeaderLoader({ slug: 'attack-on-titan' }));
    return screen.getAllByRole('heading', { level: 1 })[0]?.textContent;
  }

  it('renders the header for a loaded anime', async () => {
    expect(
      await renderLoader({
        ok: true,
        data: { kind: 'anime', anime: animeFixture() },
      }),
    ).toBe('Attack on Titan');
  });

  it('says AniList is not answering only on an outage', async () => {
    expect(
      await renderLoader({ ok: false, failure: { kind: 'timeout' } }),
    ).toBe('This anime can’t be shown right now');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('says the anime is not available on a 404, not that AniList is down', async () => {
    expect(
      await renderLoader({
        ok: false,
        failure: {
          kind: 'api_error',
          status: 404,
          error: { error: { code: 'ANIME_NOT_FOUND', message: 'No anime.' } },
        },
      }),
    ).toBe('This anime is not available');
  });

  it('says to try again in a minute on the import cap (429), not that AniList is down', async () => {
    await renderLoader({
      ok: false,
      failure: {
        kind: 'api_error',
        status: 429,
        error: { error: { code: 'ANIME_IMPORT_LIMIT_REACHED', message: 'Busy.' } },
      },
    });
    expect(screen.getByText(/Try again in a minute/)).toBeTruthy();
    expect(screen.queryByText(/AniList isn’t answering/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links to the new address when the canonical slug moved meanwhile', async () => {
    expect(
      await renderLoader({
        ok: true,
        data: { kind: 'redirect', canonicalSlug: 'frieren-2' },
      }),
    ).toBe('This anime has moved');
    expect(
      screen
        .getByRole('link', { name: 'Go to its new address' })
        .getAttribute('href'),
    ).toBe('/anime/frieren-2');
  });
});

describe('SeasonSelectorLoader', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadFranchise).mockReset();
  });

  const two = franchiseFixture([
    franchiseSeason({}),
    franchiseSeason({ anilistId: 20958, label: 'Season 2', isCurrent: false }),
  ]);

  async function renderSelector(franchise: ApiResult<AnimeFranchise>) {
    vi.mocked(loadFranchise).mockResolvedValueOnce(franchise);
    render(<>{await SeasonSelectorLoader({ slug: 'attack-on-titan' })}</>);
    return screen.queryByRole('button', { name: /^Season: / });
  }

  it('shows the selector when another season can be opened', async () => {
    expect(
      (await renderSelector({ ok: true, data: two }))?.textContent,
    ).toContain('Season 1');
  });

  it.each<[string, ApiResult<AnimeFranchise>]>([
    [
      'a single season',
      { ok: true, data: franchiseFixture([franchiseSeason({})]) },
    ],
    [
      'an unavailable franchise',
      { ok: true, data: { ...two, state: 'unavailable' } },
    ],
    ['a failure', { ok: false, failure: { kind: 'network' } }],
  ])('shows nothing for %s', async (_case, franchise) => {
    expect(await renderSelector(franchise)).toBeNull();
  });
});
