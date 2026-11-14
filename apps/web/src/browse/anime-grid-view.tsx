import Link from 'next/link';
import type { ReactNode } from 'react';
import { AnimeCard } from './anime-card';
import {
  type AnimeGridState,
  GRID_PAGE_SIZE,
  type GridMore,
} from './anime-grid';

function assertNever(value: never): never {
  throw new Error(`Unhandled grid state: ${typeof value}`);
}

const SKELETON_SLOTS = Array.from(
  { length: GRID_PAGE_SIZE },
  (_, slot) => `slot-${slot}`,
);

/** A whole-list message: empty list (`info`) or failed load (`error`, announced as an alert). */
export function GridStateCard({
  title,
  body,
  action,
  tone = 'info',
}: {
  readonly title: string;
  readonly body: string;
  readonly action: ReactNode;
  readonly tone?: 'info' | 'error';
}) {
  return (
    <div
      className={tone === 'error' ? 'br-state br-state--error' : 'br-state'}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="br-state__actions">{action}</div>
    </div>
  );
}

const FAILURE_BODY = {
  busy: 'Too many requests right now. Wait a few seconds, then try again.',
  unavailable:
    'Something went wrong on our side or at AniList. Your link is kept, so trying again is safe.',
} as const;

/**
 * The results of a list page. `retryHref` reloads the same URL (a full page load: plain `<a>`);
 * `nextHref` asks for one more page and keeps the scroll position.
 */
export function AnimeGridView({
  state,
  nextHref,
  retryHref,
  empty,
}: {
  readonly state: AnimeGridState;
  readonly nextHref: string;
  readonly retryHref: string;
  readonly empty: ReactNode;
}) {
  switch (state.kind) {
    case 'loaded':
      return (
        <>
          <ul className="br-grid">
            {state.entries.map((entry) => (
              <li key={entry.anilistId}>
                <AnimeCard entry={entry} headingLevel="h2" />
              </li>
            ))}
          </ul>
          <GridMoreView
            more={state.more}
            shown={state.entries.length}
            nextHref={nextHref}
            retryHref={retryHref}
          />
        </>
      );
    case 'empty':
      return empty;
    case 'failed':
      return (
        <GridStateCard
          tone="error"
          title="This list didn't load"
          body={FAILURE_BODY[state.reason]}
          action={
            <a
              className="ol-btn ol-btn--secondary"
              href={retryHref}
              rel="nofollow"
            >
              Try again
            </a>
          }
        />
      );
    default:
      return assertNever(state);
  }
}

function GridMoreView({
  more,
  shown,
  nextHref,
  retryHref,
}: {
  readonly more: GridMore;
  readonly shown: number;
  readonly nextHref: string;
  readonly retryHref: string;
}) {
  switch (more) {
    case 'available':
      return (
        <div className="br-more-wrap">
          <Link
            className="ol-btn ol-btn--secondary br-more"
            href={nextHref}
            scroll={false}
            prefetch={false}
            rel="nofollow"
          >
            Show more
          </Link>
        </div>
      );
    case 'failed':
      return (
        <div className="br-more-wrap" role="status">
          <p>The next cards didn&apos;t load.</p>
          <a
            className="ol-btn ol-btn--secondary br-more"
            href={retryHref}
            rel="nofollow"
          >
            Retry loading more
          </a>
        </div>
      );
    case 'capped':
      return (
        <div className="br-more-wrap">
          <p>Showing the first {shown}.</p>
        </div>
      );
    case 'end':
      return null;
    default:
      return assertNever(more);
  }
}

/** The Suspense fallback: announced once as text, the placeholder cards are hidden from assistive tech. */
export function AnimeGridSkeleton({ label }: { readonly label: string }) {
  return (
    <div aria-busy="true">
      <p className="br-sr">Loading {label}</p>
      <ul className="br-grid" aria-hidden="true">
        {SKELETON_SLOTS.map((slot) => (
          <li key={slot}>
            <span className="ol-skel ol-skel--cover" />
          </li>
        ))}
      </ul>
    </div>
  );
}
