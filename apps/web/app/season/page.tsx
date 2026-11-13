import { ANIME_SEASONS, type AnimeListSeason } from '@otakuleague/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import { loadAnimeListPage } from '../../src/anime/data';
import {
  type AnimeGridState,
  collectGridPages,
} from '../../src/browse/anime-grid';
import {
  AnimeGridSkeleton,
  AnimeGridView,
  GridStateCard,
} from '../../src/browse/anime-grid-view';
import {
  currentSeason,
  isSameSeason,
  parseSeasonRequest,
  type SearchParamsRecord,
  type SeasonRequest,
  seasonHref,
  seasonLabel,
  stepSeason,
} from '../../src/browse/season';
import '../styles/browse.css';

/**
 * The request's season, read at request time (the current season depends on the clock). Cached per
 * request, so the page and generateMetadata agree on `now`.
 */
const readRequest = cache(
  async (
    searchParams: Promise<SearchParamsRecord>,
  ): Promise<{ readonly request: SeasonRequest; readonly now: Date }> => {
    const params = await searchParams;
    await connection();
    const now = new Date();
    return { request: parseSeasonRequest(params, now), now };
  },
);

// Explicit props instead of the generated PageProps: CI lints before `next typegen`.
type SeasonPageProps = {
  readonly searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({
  searchParams,
}: SeasonPageProps): Promise<Metadata> {
  const { request } = await readRequest(searchParams);
  const label = seasonLabel(request.season);
  const title = `${label} anime`;
  const description = `Every anime of ${label}, most popular first: new shows, sequels and returning series.`;
  return {
    title,
    description,
    alternates: { canonical: seasonHref(request.season) },
    openGraph: { title, description },
    twitter: { card: 'summary', title, description },
  };
}

// The page shell is static; the head and results depend on the URL and the clock, so they stream.
export default function SeasonPage({ searchParams }: SeasonPageProps) {
  return (
    <main className="br-page">
      <Suspense
        fallback={
          <>
            <div className="br-head br-head--placeholder" aria-hidden="true" />
            <AnimeGridSkeleton label="anime" />
          </>
        }
      >
        <SeasonContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SeasonContent({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsRecord>;
}) {
  const { request, now } = await readRequest(searchParams);
  const { season } = request;
  return (
    <>
      <SeasonHead season={season} now={now} />
      {/* Keyed by season only: "Show more" keeps the loaded cards on screen while the next page loads. */}
      <Suspense
        key={`${season.season}-${season.year}`}
        fallback={<AnimeGridSkeleton label={seasonLabel(season)} />}
      >
        <SeasonResults request={request} now={now} />
      </Suspense>
    </>
  );
}

async function SeasonResults({
  request,
  now,
}: {
  readonly request: SeasonRequest;
  readonly now: Date;
}) {
  const state = await collectGridPages(
    ({ cursor, limit }) =>
      loadAnimeListPage('seasonal', { season: request.season, cursor, limit }),
    request.page,
  );
  return <SeasonResultsView state={state} request={request} now={now} />;
}

/** Copy for an empty season: a past season has nothing listed, a current or future one nothing announced yet. */
function emptyTitle(season: AnimeListSeason, now: Date): string {
  const thisSeason = currentSeason(now);
  const isPast =
    season.year * 4 + ANIME_SEASONS.indexOf(season.season) <
    thisSeason.year * 4 + ANIME_SEASONS.indexOf(thisSeason.season);
  return isPast
    ? `No anime listed for ${seasonLabel(season)}`
    : `Nothing announced for ${seasonLabel(season)} yet`;
}

export function SeasonResultsView({
  state,
  request,
  now,
}: {
  readonly state: AnimeGridState;
  readonly request: SeasonRequest;
  readonly now: Date;
}) {
  const thisSeason = currentSeason(now);
  return (
    <AnimeGridView
      state={state}
      nextHref={seasonHref(request.season, request.page + 1)}
      retryHref={seasonHref(request.season, request.page)}
      empty={
        <GridStateCard
          title={emptyTitle(request.season, now)}
          body="Shows appear here as soon as AniList lists them for this season."
          action={
            isSameSeason(request.season, thisSeason) ? null : (
              <Link
                className="ol-btn ol-btn--secondary"
                href={seasonHref(thisSeason)}
                prefetch={false}
                rel="nofollow"
              >
                Back to this season
              </Link>
            )
          }
        />
      }
    />
  );
}

/** Heading and previous/next season links (the season picker is the next slice). */
export function SeasonHead({
  season,
  now,
}: {
  readonly season: AnimeListSeason;
  readonly now: Date;
}) {
  const label = seasonLabel(season);
  const isCurrent = isSameSeason(season, currentSeason(now));
  return (
    <header className="br-head">
      <div>
        <h1>{label} anime</h1>
        <p>
          {isCurrent
            ? 'Everything airing this season, most popular first.'
            : `Everything from ${label}, most popular first.`}
        </p>
      </div>
      <nav className="br-stepper" aria-label="Seasons">
        <StepLink season={stepSeason(season, -1, now)} direction="Previous" />
        {!isCurrent && (
          <Link
            className="ol-btn ol-btn--ghost ol-btn--sm"
            href={seasonHref(currentSeason(now))}
            prefetch={false}
            rel="nofollow"
          >
            This season
          </Link>
        )}
        <StepLink season={stepSeason(season, 1, now)} direction="Next" />
      </nav>
    </header>
  );
}

/** Out of range (before Winter 1917, after Fall of next year): a disabled placeholder, not a link. */
function StepLink({
  season,
  direction,
}: {
  readonly season: AnimeListSeason | null;
  readonly direction: 'Previous' | 'Next';
}) {
  const glyph = direction === 'Previous' ? '‹' : '›';
  if (season === null) {
    return (
      <span className="br-icon-btn" aria-disabled="true" aria-hidden="true">
        {glyph}
      </span>
    );
  }
  return (
    <Link
      className="br-icon-btn"
      href={seasonHref(season)}
      aria-label={`${direction} season: ${seasonLabel(season)}`}
      prefetch={false}
      rel="nofollow"
    >
      <span aria-hidden="true">{glyph}</span>
    </Link>
  );
}
