import type { AnimeDetails } from '@otakuleague/shared-types';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { loadAnime } from '../../../src/anime/data';
import { animeTitle } from '../../../src/anime/format';
import { tabHref } from '../../../src/anime/tabs';

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

function BasicHeader({ anime }: { readonly anime: AnimeDetails }) {
  const native = anime.titleNative?.value;
  const romaji = anime.titleRomaji?.value;
  const subtitle = [native, romaji].filter(
    (part) => part !== undefined && part !== animeTitle(anime),
  );
  return (
    <header className="anime-header">
      <h1 className="anime-header__title">{animeTitle(anime)}</h1>
      {subtitle.length > 0 && (
        <p className="anime-header__subtitle">{subtitle.join(' · ')}</p>
      )}
    </header>
  );
}

/**
 * The header's data, which may import the anime on a first visit: always rendered inside
 * <Suspense fallback={<HeaderLoading />}>. The full header (mockup-Main) comes in PR3.
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
  return <BasicHeader anime={result.data.anime} />;
}
