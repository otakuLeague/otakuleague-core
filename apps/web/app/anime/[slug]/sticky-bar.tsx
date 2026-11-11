'use client';

import { useEffect, useState } from 'react';
import type { HeaderFacts } from '../../../src/anime/header-facts';
import { SeasonChip, StatusChip } from './chips';
import { Cover } from './cover';
import { HeartIcon, PlusIcon } from './icons';
import { TabsNav } from './tabs-nav';

/**
 * mockup-Scrolled: a compact bar that slides in once the header has scrolled out of view.
 * Hidden, it is inert, so it is skipped by keyboard and screen readers.
 */
export function StickyBar({
  facts,
  slug,
  heroId,
}: {
  readonly facts: HeaderFacts;
  readonly slug: string;
  readonly heroId: string;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(heroId);
    if (hero === null) return undefined;
    // The global header covers the top --header-h of the viewport: the hero is out of view once
    // it has gone under it, so the observed area starts below the header.
    const headerHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--header-h',
        ),
      ) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only once scrolled past: a header below the viewport (never, today) keeps it hidden.
        setShown(
          entry !== undefined &&
            !entry.isIntersecting &&
            entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0),
        );
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroId]);

  return (
    <div
      className={shown ? 'anime-sticky anime-sticky--shown' : 'anime-sticky'}
      inert={!shown}
      data-testid="anime-sticky"
    >
      <div className="anime-sticky__progress" aria-hidden="true" />
      <div className="anime-sticky__inner">
        <Cover
          url={facts.coverUrl}
          title={facts.title}
          initials={facts.initials}
          size="mini"
        />
        <div className="anime-sticky__titles">
          <p className="anime-sticky__title">{facts.title}</p>
          <div className="anime-sticky__chips">
            {facts.status && <StatusChip status={facts.status} size="mini" />}
            {facts.format && (
              <span className="anime-chip anime-chip--mini">
                {facts.format}
              </span>
            )}
            {facts.season && <SeasonChip season={facts.season} size="mini" />}
            {facts.episodes && (
              <span className="anime-chip anime-chip--mini ol-num">
                {facts.episodes}
              </span>
            )}
            {facts.score !== null && (
              <span className="anime-chip anime-chip--mini anime-chip--gold ol-num">
                ★ {facts.score}
              </span>
            )}
            {facts.ranksShort && (
              <span
                className="anime-chip anime-chip--mini anime-chip--muted ol-num"
                title={[facts.rankRated, facts.rankPopular]
                  .filter(Boolean)
                  .join(' · ')}
              >
                {facts.ranksShort}
              </span>
            )}
            {facts.favourites && (
              <span className="anime-chip anime-chip--mini anime-chip--heart ol-num">
                ♥ {facts.favourites}
              </span>
            )}
          </div>
        </div>
        <TabsNav slug={slug} variant="pills" />
        <div className="anime-sticky__actions">
          <button
            type="button"
            className="ol-btn anime-icon-btn anime-icon-btn--heart"
            aria-label="Add to Favourites"
          >
            <HeartIcon size={15} />
          </button>
          <button
            type="button"
            className="ol-btn anime-icon-btn"
            aria-label="Add to List"
          >
            <PlusIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
