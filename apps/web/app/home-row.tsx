import Link from 'next/link';
import { Suspense } from 'react';
import { loadAnimeList } from '../src/anime/data';
import { AnimeCard } from '../src/browse/anime-card';
import {
  HOME_ROW_FETCH_LIMIT,
  HOME_ROW_MAX_CARDS,
  type HomeRowDefinition,
  type HomeRowState,
  toHomeRowState,
} from '../src/home/home-rows';

function assertNever(value: never): never {
  throw new Error(`Unhandled row state: ${typeof value}`);
}

const SKELETON_SLOTS = Array.from(
  { length: HOME_ROW_MAX_CARDS },
  (_, slot) => `slot-${slot}`,
);

/** One catalog row: the head is static (prerendered), the cards stream in behind their own Suspense. */
export function HomeRow({ row }: { readonly row: HomeRowDefinition }) {
  const headingId = `hm-row-${row.id}`;
  return (
    <section className="br-section" aria-labelledby={headingId}>
      <div className="br-section__head">
        <div>
          <h2 id={headingId}>{row.title}</h2>
          <p>{row.subtitle}</p>
        </div>
        <Link className="br-section__all" href={row.href} prefetch={false}>
          {row.linkLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="hm-row-slot">
        <Suspense fallback={<HomeRowSkeleton title={row.title} />}>
          <HomeRowLoader row={row} />
        </Suspense>
      </div>
    </section>
  );
}

async function HomeRowLoader({ row }: { readonly row: HomeRowDefinition }) {
  const state = toHomeRowState(
    await loadAnimeList(row.kind, HOME_ROW_FETCH_LIMIT),
  );
  return <HomeRowView row={row} state={state} />;
}

export function HomeRowView({
  row,
  state,
}: {
  readonly row: HomeRowDefinition;
  readonly state: HomeRowState;
}) {
  switch (state.kind) {
    case 'loaded':
      return (
        <ul className="br-row-scroll">
          {state.entries.map((entry) => (
            <li key={entry.anilistId}>
              <AnimeCard entry={entry} headingLevel="h3" />
            </li>
          ))}
        </ul>
      );
    case 'empty':
      return (
        <div className="hm-empty">
          <p className="hm-empty__title">Nothing here yet</p>
          <p>This list fills up as soon as AniList has shows for it.</p>
          <Link
            className="ol-btn ol-btn--secondary ol-btn--sm"
            href={row.href}
            prefetch={false}
          >
            Open the full list
          </Link>
        </div>
      );
    case 'failed':
      return (
        <div className="br-inline-error" role="status">
          <p>
            {row.title} didn&apos;t load. The rest of the page is fine. Reload
            to try again.
          </p>
        </div>
      );
    default:
      return assertNever(state);
  }
}

/** Announced once as text; the placeholder cards are hidden from assistive tech. */
export function HomeRowSkeleton({ title }: { readonly title: string }) {
  return (
    <div>
      <p className="hm-sr">Loading {title}</p>
      <ul className="br-row-scroll" aria-hidden="true">
        {SKELETON_SLOTS.map((slot) => (
          <li key={slot}>
            <span className="ol-skel ol-skel--cover" />
          </li>
        ))}
      </ul>
    </div>
  );
}
