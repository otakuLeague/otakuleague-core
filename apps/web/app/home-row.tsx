import type { AnimeListEntry } from '@otakuleague/shared-types';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { loadAnimeList } from '../src/anime/data';
import {
  cardLink,
  cardTitle,
  HOME_ROW_MAX_CARDS,
  type HomeRowDefinition,
  type HomeRowState,
  toHomeRowState,
} from '../src/home/home-rows';

function assertNever(value: never): never {
  throw new Error(`Unhandled row state: ${JSON.stringify(value)}`);
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
        <Suspense fallback={<HomeRowSkeleton />}>
          <HomeRowLoader row={row} />
        </Suspense>
      </div>
    </section>
  );
}

async function HomeRowLoader({ row }: { readonly row: HomeRowDefinition }) {
  const state = toHomeRowState(await loadAnimeList(row.kind));
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
        <ul className="br-row-scroll" aria-label={row.title}>
          {state.entries.map((entry) => (
            <li key={entry.anilistId}>
              <HomeCard entry={entry} />
            </li>
          ))}
        </ul>
      );
    case 'empty':
      return (
        <div className="hm-empty">
          <p>
            <strong>Nothing here yet</strong>
            This list fills up as soon as AniList has shows for it.
          </p>
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
        <div className="br-inline-error" role="alert">
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

function HomeCard({ entry }: { readonly entry: AnimeListEntry }) {
  const { href, rel } = cardLink(entry);
  return (
    <Link className="ol-anime-card" href={href} rel={rel} prefetch={false}>
      <div className="ol-anime-card__cover">
        {entry.coverImageUrl !== null && (
          // Decorative: the title right below names the card.
          <Image src={entry.coverImageUrl} alt="" width={176} height={264} />
        )}
      </div>
      <h3 className="ol-anime-card__title">{cardTitle(entry)}</h3>
    </Link>
  );
}

export function HomeRowSkeleton() {
  return (
    <ul className="br-row-scroll" aria-busy="true" aria-label="Loading">
      {SKELETON_SLOTS.map((slot) => (
        <li key={slot}>
          <span className="ol-skel ol-skel--cover" />
        </li>
      ))}
    </ul>
  );
}
