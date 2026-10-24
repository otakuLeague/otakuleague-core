import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadAnime, resolveAnimeSlug } from '../../../src/anime/data';
import { animeTitle, excerpt } from '../../../src/anime/format';
import { resolveTab } from '../../../src/anime/resolve-tab';
import {
  type AnimeTabSegment,
  tabHref,
  tabLabel,
} from '../../../src/anime/tabs';

function ComingSoon({ segment }: { readonly segment: AnimeTabSegment }) {
  return (
    <div className="ol-state">
      <p className="ol-state__title">Coming soon</p>
      <p className="ol-state__body">
        The {tabLabel(segment)} tab is on its way.
      </p>
    </div>
  );
}

/**
 * One tab: the slug is resolved first (308 for another slug, 404 for none), then the tab's
 * own content streams behind its own Suspense boundary, never holding up the header.
 */
export async function TabPage({
  slug,
  segment,
}: {
  readonly slug: string;
  readonly segment: AnimeTabSegment;
}) {
  await resolveTab(slug, segment);
  return (
    <Suspense
      fallback={<div className="ol-skel" aria-label="Loading" role="status" />}
    >
      <ComingSoon segment={segment} />
    </Suspense>
  );
}

/** Per-tab title and link preview (cover, synopsis excerpt); streams for browsers. */
export async function tabMetadata(
  params: Promise<{ slug: string }>,
  segment: AnimeTabSegment,
): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveAnimeSlug(slug);
  if (!resolution.ok) {
    const missing =
      resolution.failure.kind === 'api_error' &&
      (resolution.failure.status === 404 || resolution.failure.status === 400);
    // An outage is not a missing anime: keep a neutral title for a page that may exist.
    return { title: missing ? 'Anime not found' : tabLabel(segment) };
  }
  const canonical = resolution.data.canonicalSlug;
  // Another slug of the anime is being redirected: never start an import for it.
  if (canonical !== slug) return { title: tabLabel(segment) };
  const result = await loadAnime(canonical);
  if (!result.ok || result.data.kind !== 'anime') {
    return { title: tabLabel(segment) };
  }
  const anime = result.data.anime;
  const title =
    segment === ''
      ? animeTitle(anime)
      : `${animeTitle(anime)} · ${tabLabel(segment)}`;
  const description = excerpt(anime.synopsis?.value);
  const cover = anime.coverImageUrl?.value;
  return {
    title,
    description,
    alternates: { canonical: tabHref(canonical, segment) },
    openGraph: {
      title,
      description,
      images: cover === undefined ? [] : [cover],
    },
    twitter: { card: 'summary', title, description },
  };
}
