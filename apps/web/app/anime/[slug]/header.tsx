import type { AnimeDetails } from '@otakuleague/shared-types';
import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { accentPalette } from '../../../src/anime/accent';
import { loadAnime, loadFranchise } from '../../../src/anime/data';
import { type HeaderFacts, headerFacts } from '../../../src/anime/header-facts';
import { seasonOptions, tabHref } from '../../../src/anime/tabs';
import { SeasonChip, StatusChip } from './chips';
import { Countdown } from './countdown';
import { Cover } from './cover';
import { SeasonSelector } from './season-selector';
import {
  FormatIcon,
  HeartIcon,
  MembersIcon,
  PlusIcon,
  StarIcon,
} from './icons';
import { StickyBar } from './sticky-bar';

/** The id the sticky bar watches: it appears once this element has scrolled out of view. */
export const HERO_ID = 'anime-hero';

/** The header's fallback: brief for a cached anime, a few seconds on a first-visit import. */
export function HeaderLoading() {
  return (
    <header className="anime-header" aria-busy="true">
      <div className="ol-skel ol-skel--cover" aria-hidden="true" />
      <p role="status">Loading this anime…</p>
    </header>
  );
}

/** A header-sized state, always with the page's level-1 heading. */
function HeaderState({
  mark,
  title,
  error = false,
  children,
}: {
  readonly mark: string;
  readonly title: string;
  readonly error?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <header
      className={error ? 'ol-state ol-state--error' : 'ol-state'}
      role={error ? 'alert' : undefined}
    >
      <div className="ol-state__mark" aria-hidden="true">
        {mark}
      </div>
      <h1 className="ol-state__title">{title}</h1>
      <div className="ol-state__body">{children}</div>
    </header>
  );
}

/**
 * The anime's accent for the whole page (tabs included, which render outside this Suspense
 * boundary). Every value is "#rrggbb": the cover colour is validated, the rest computed.
 */
function AccentStyle({ coverColor }: { readonly coverColor: string | null }) {
  const palette = accentPalette(coverColor);
  const light = `--accent-ink: ${palette.inkLight};`;
  return (
    <style>
      {`.anime-page { --accent: ${palette.accent}; --on-accent: ${palette.onAccent}; --accent-ink: ${palette.inkDark}; }
[data-theme='light'] .anime-page, .anime-page[data-theme='light'] { ${light} }
@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) .anime-page { ${light} } }`}
    </style>
  );
}

/** Links to # until creator and studio pages exist. */
function NameLinks({ names }: { readonly names: readonly string[] }) {
  return names.map((name, index) => (
    <span key={`${index}-${name}`}>
      {index > 0 && ', '}
      <a href="#">{name}</a>
    </span>
  ));
}

function Credits({ facts }: { readonly facts: HeaderFacts }) {
  const hasCreators = facts.creators.length > 0;
  const hasStudios = facts.studios.length > 0;
  if (!hasCreators && !hasStudios) return null;
  return (
    <p className="anime-hero__credits">
      {hasCreators && (
        <span>
          Created by <NameLinks names={facts.creators} />
        </span>
      )}
      {hasCreators && hasStudios && (
        <span className="anime-hero__dot" aria-hidden="true">
          ·
        </span>
      )}
      {hasStudios && (
        <span>
          Animated by <NameLinks names={facts.studios} />
        </span>
      )}
    </p>
  );
}

function Chips({ facts }: { readonly facts: HeaderFacts }) {
  if (
    !facts.status &&
    !facts.format &&
    !facts.season &&
    !facts.runtime &&
    !facts.favourites
  ) {
    return null;
  }
  return (
    <div className="anime-hero__chips">
      {facts.status && <StatusChip status={facts.status} />}
      {facts.format && (
        <span className="anime-chip anime-chip--full">
          <FormatIcon />
          {facts.format}
        </span>
      )}
      {facts.season && <SeasonChip season={facts.season} />}
      {facts.runtime && (
        <span className="anime-chip anime-chip--full ol-num">
          {facts.runtime}
        </span>
      )}
      {facts.favourites && (
        <span className="anime-chip anime-chip--full anime-chip--heart ol-num">
          <HeartIcon size={14} />
          <span className="anime-sr-only">Favourites: </span>
          {facts.favourites}
        </span>
      )}
    </div>
  );
}

/** One stats-card cell: the name is its visible caption unless a rank takes that place. */
function Stat({
  tone,
  name,
  value,
  rank,
  icon,
}: {
  readonly tone: 'score' | 'members' | 'favourites';
  readonly name: string;
  readonly value: ReactNode;
  readonly rank: string | null;
  readonly icon: ReactNode;
}) {
  return (
    <div className={`anime-stat anime-stat--${tone}`}>
      <dt
        className={
          rank === null ? 'ol-label anime-stat__caption' : 'anime-sr-only'
        }
      >
        {name}
      </dt>
      <dd className="anime-stat__value">
        <span className="anime-stat__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="ol-num">{value}</span>
      </dd>
      {rank !== null && (
        <dd className="ol-label anime-stat__caption">{rank}</dd>
      )}
    </div>
  );
}

/** Score, members and favourites, each shown only when AniList gives it. */
function StatsCard({ facts }: { readonly facts: HeaderFacts }) {
  if (
    facts.score === null &&
    facts.members === null &&
    facts.favourites === null
  ) {
    return null;
  }
  return (
    <dl className="anime-stats">
      {facts.score !== null && (
        <Stat
          tone="score"
          name="Score"
          value={
            <>
              {facts.score}
              <small>%</small>
            </>
          }
          rank={facts.rankRated}
          icon={<StarIcon />}
        />
      )}
      {facts.members !== null && (
        <Stat
          tone="members"
          name="Members"
          value={facts.members}
          rank={facts.rankPopular}
          icon={<MembersIcon />}
        />
      )}
      {facts.favourites !== null && (
        <Stat
          tone="favourites"
          name="Favourites"
          value={facts.favourites}
          rank={null}
          icon={<HeartIcon size={14} />}
        />
      )}
    </dl>
  );
}

/**
 * Phone only (mockup-Mobile): the score next to the cover, where the stats card is hidden.
 * Each of the two is display:none where the other shows, so a screen reader meets one.
 */
function PhoneScore({ facts }: { readonly facts: HeaderFacts }) {
  const ranks = [facts.rankRated, facts.rankPopular].filter(
    (rank) => rank !== null,
  );
  if (facts.score === null && ranks.length === 0) return null;
  return (
    <div className="anime-hero__phone-score">
      {facts.score !== null && (
        <span className="ol-num anime-hero__phone-value">
          <StarIcon />
          <span>
            <span className="anime-sr-only">Score </span>
            {facts.score}
            <small>%</small>
          </span>
        </span>
      )}
      {ranks.map((rank) => (
        <span key={rank} className="ol-label">
          {rank}
        </span>
      ))}
    </div>
  );
}

/** mockup-Main (desktop) and mockup-Mobile (phone): one markup, laid out by anime-page.css. */
export function AnimeHeader({
  facts,
  coverColor,
  slug,
  seasonSelector = null,
}: {
  readonly facts: HeaderFacts;
  readonly coverColor: string | null;
  readonly slug: string;
  /** `SeasonSelectorLoader` inside its own Suspense boundary, so the header never waits. */
  readonly seasonSelector?: ReactNode;
}) {
  return (
    <>
      <AccentStyle coverColor={coverColor} />
      <header id={HERO_ID} className="anime-hero">
        <div className="anime-hero__band" aria-hidden="true" />
        <div className="anime-hero__neon" aria-hidden="true" />
        <div className="anime-hero__inner">
          <div className="anime-hero__top">
            <Cover
              url={facts.coverUrl}
              title={facts.title}
              initials={facts.initials}
              size="hero"
            />
            <div className="anime-hero__titles">
              <h1 className="anime-hero__title">{facts.title}</h1>
              {facts.subtitle && (
                <p className="anime-hero__subtitle">{facts.subtitle}</p>
              )}
              <span className="anime-hero__bar" aria-hidden="true" />
              <Credits facts={facts} />
            </div>
            {/* After the h1 for screen readers; placed beside the cover by CSS order on phones. */}
            <PhoneScore facts={facts} />
          </div>
          <div className="anime-hero__bottom">
            <div className="anime-hero__meta">
              <Chips facts={facts} />
              <div className="anime-hero__actions">
                {/* No action yet: lists and favourites need accounts. */}
                <button
                  type="button"
                  className="ol-btn ol-btn--primary anime-hero__add"
                >
                  <PlusIcon />
                  Add to List
                </button>
                <button type="button" className="ol-btn anime-hero__fav">
                  <HeartIcon />
                  <span className="anime-hero__fav-long">
                    Add to Favourites
                  </span>
                  <span className="anime-hero__fav-short">Favourite</span>
                </button>
                {facts.nextEpisode && (
                  <Countdown
                    episode={facts.nextEpisode.episode}
                    airingAt={facts.nextEpisode.airingAt}
                  />
                )}
                {seasonSelector}
              </div>
            </div>
            <StatsCard facts={facts} />
          </div>
        </div>
      </header>
      <StickyBar facts={facts} slug={slug} heroId={HERO_ID} />
    </>
  );
}

/** The season selector, or nothing for a single season or an unreadable franchise. */
export async function SeasonSelectorLoader({
  slug,
}: {
  readonly slug: string;
}) {
  const franchise = await loadFranchise(slug);
  const seasons = seasonOptions(franchise.ok ? franchise.data : null);
  return seasons && <SeasonSelector slug={slug} seasons={seasons} />;
}

/**
 * The header's data, which may import the anime on a first visit: always rendered inside
 * <Suspense fallback={<HeaderLoading />}>.
 */
export async function AnimeHeaderLoader({ slug }: { readonly slug: string }) {
  const result = await loadAnime(slug);
  if (!result.ok) {
    if (result.failure.kind === 'api_error' && result.failure.status === 404) {
      // Removed in the meantime, or no source can serve it (AniList off, not cached).
      return (
        <HeaderState mark="?" title="This anime is not available">
          <p>It was removed, or its data source is switched off.</p>
        </HeaderState>
      );
    }
    return (
      <HeaderState mark="!" title="This anime can’t be shown right now" error>
        <p>
          AniList isn’t answering and we have no saved data for this anime yet.
          Try again in a few minutes.
        </p>
      </HeaderState>
    );
  }
  if (result.data.kind === 'redirect') {
    // The canonical slug moved between resolving and loading (a title changed).
    return (
      <HeaderState mark="→" title="This anime has moved">
        <Link href={tabHref(result.data.canonicalSlug, '')}>
          Go to its new address
        </Link>
      </HeaderState>
    );
  }
  const anime: AnimeDetails = result.data.anime;
  return (
    <AnimeHeader
      facts={headerFacts(anime)}
      coverColor={anime.coverColor?.value ?? null}
      slug={slug}
      seasonSelector={
        <Suspense fallback={null}>
          <SeasonSelectorLoader slug={slug} />
        </Suspense>
      }
    />
  );
}
