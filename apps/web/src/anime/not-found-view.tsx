import Link from 'next/link';

/** mockup-States 2, without the suggestions: those come with search (OTA-98). */
export function AnimeNotFoundView() {
  return (
    <main className="ol-root anime-page anime-page__tab">
      <div className="ol-state">
        <div className="ol-state__mark" aria-hidden="true">
          ?
        </div>
        <h1 className="ol-state__title">No anime at this address</h1>
        <p className="ol-state__body">
          The link may be mistyped, or the anime was removed.
        </p>
        <Link className="ol-btn ol-btn--secondary ol-btn--sm" href="/search">
          Search all anime
        </Link>
      </div>
    </main>
  );
}
