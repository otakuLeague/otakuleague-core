import { Suspense } from 'react';
import { resolveAnimeSlug } from '../../../src/anime/data';
import { AnimeHeaderLoader, HeaderLoading } from './header';
import { TabsNav } from './tabs-nav';
import './anime-page.css';

// Blocking on purpose: each tab page resolves the slug before anything is sent, so a 308 or a
// 404 is a real HTTP status (OTA-97). Only the header's first-visit import streams.
export const instant = false;

export default async function AnimeLayout({
  children,
  params,
}: LayoutProps<'/anime/[slug]'>) {
  const { slug } = await params;
  const resolution = await resolveAnimeSlug(slug);
  // Unknown slug, another slug of the anime, or the API down: the page answers on its own
  // (404, 308 or the error page), before this frame would render.
  if (!resolution.ok || resolution.data.canonicalSlug !== slug) {
    return children;
  }
  const canonical = resolution.data.canonicalSlug;
  return (
    <div className="ol-root anime-page">
      <Suspense fallback={<HeaderLoading />}>
        <AnimeHeaderLoader slug={canonical} />
      </Suspense>
      <TabsNav slug={canonical} />
      <main className="anime-page__tab">{children}</main>
    </div>
  );
}
