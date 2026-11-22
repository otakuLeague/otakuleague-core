import { Fragment } from 'react';
import { loadAnime } from '../../../src/anime/data';
import {
  type OverviewFacts,
  informationRows,
  overviewFacts,
} from '../../../src/anime/overview-facts';
import type { OverviewTrailer } from '../../../src/anime/trailer';
import { CollapsibleSynopsis } from './synopsis';
import { TrailerPlayer } from './trailer';
import './overview.css';

const SYNOPSIS_ID = 'anime-synopsis';
/** Without JS the toggle can't work: show the whole synopsis and hide the button. */
const NO_JS_SYNOPSIS = `.ov-syn[data-state] p{display:block!important;-webkit-line-clamp:none!important;overflow:visible!important;mask-image:none!important}.ov-syn-toggle{display:none!important}`;

function Synopsis({
  synopsis,
}: {
  readonly synopsis: OverviewFacts['synopsis'];
}) {
  if (synopsis === null) {
    return (
      <p className="ov-empty">
        <b>No synopsis yet.</b> Our source has no description for this entry. It
        appears here as soon as one is added.
      </p>
    );
  }
  // React text only: the API sends plain text, and anything that looks like HTML stays text.
  const paragraphs = synopsis.paragraphs.map((paragraph, index) => (
    <p key={index}>{paragraph}</p>
  ));
  return (
    <>
      {synopsis.collapse !== 'none' ? (
        <>
          <CollapsibleSynopsis
            id={SYNOPSIS_ID}
            clamp={synopsis.collapse === 'clamp'}
          >
            {paragraphs}
          </CollapsibleSynopsis>
          <noscript>
            <style>{NO_JS_SYNOPSIS}</style>
          </noscript>
        </>
      ) : (
        <div className="ov-syn" id={SYNOPSIS_ID}>
          {paragraphs}
        </div>
      )}
      {synopsis.source !== null && (
        <p className="ov-note">Source: {synopsis.source}</p>
      )}
    </>
  );
}

function Trailer({
  trailer,
  title,
}: {
  readonly trailer: OverviewTrailer;
  readonly title: string;
}) {
  return (
    <section className="ov-sec ov-sec--trailer" aria-labelledby="ov-trailer-h">
      <div className="ov-sec__head">
        <h2 id="ov-trailer-h">Trailer</h2>
      </div>
      <TrailerPlayer trailer={trailer} title={title} />
      {/* Plain link: works without JS, and when the host refuses the embed. */}
      <a
        className="ov-trailer__watch"
        href={trailer.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Watch on {trailer.siteLabel}
        <span className="anime-sr-only"> (opens in a new tab)</span>
      </a>
    </section>
  );
}

function Genres({ genres }: { readonly genres: readonly string[] }) {
  return (
    <section className="ov-sec ov-sec--genres" aria-labelledby="ov-genres-h">
      <div className="ov-sec__head">
        <h2 id="ov-genres-h">Genres</h2>
      </div>
      <ul className="ov-chips">
        {genres.map((genre) => (
          <li key={genre}>
            <span className="ol-chip">{genre}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Text only, never a link or control: on phones its wrapper is `display: contents` and reordered. */
function InformationCard({
  rows,
}: {
  readonly rows: ReturnType<typeof informationRows>;
}) {
  return (
    <section
      className="ov-card ov-sec ov-sec--info"
      aria-labelledby="ov-info-h"
    >
      <div className="ov-sec__head">
        <h2 id="ov-info-h">Information</h2>
      </div>
      <dl className="ov-facts">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.datetime === undefined ? (
                row.text
              ) : (
                <time dateTime={row.datetime}>{row.text}</time>
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/**
 * The Overview tab for a loaded anime. Main column: trailer, synopsis, genres; side: Information.
 * On phones both wrappers dissolve and CSS orders trailer, synopsis, information, genres.
 */
export function Overview({ facts }: { readonly facts: OverviewFacts }) {
  const rows = informationRows(facts);
  return (
    <div className={rows.length > 0 ? 'ov-grid' : 'ov-grid ov-grid--single'}>
      <div className="ov-main">
        {facts.trailer !== null && (
          <Trailer trailer={facts.trailer} title={facts.title} />
        )}
        <section
          className="ov-sec ov-sec--synopsis"
          aria-labelledby="ov-synopsis-h"
        >
          <div className="ov-sec__head">
            <h2 id="ov-synopsis-h">Synopsis</h2>
          </div>
          <Synopsis synopsis={facts.synopsis} />
        </section>
        {facts.genres.length > 0 && <Genres genres={facts.genres} />}
      </div>
      {rows.length > 0 && (
        <aside className="ov-side" aria-label="Key facts">
          <InformationCard rows={rows} />
        </aside>
      )}
    </div>
  );
}

/**
 * Reads the same request-cached anime as the header (no extra API call). Failures and
 * redirects render nothing: the header already shows those states.
 */
export async function OverviewLoader({ slug }: { readonly slug: string }) {
  const result = await loadAnime(slug);
  if (!result.ok || result.data.kind !== 'anime') return null;
  return <Overview facts={overviewFacts(result.data.anime)} />;
}
