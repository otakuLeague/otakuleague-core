import { Fragment } from 'react';
import { loadAnime } from '../../../src/anime/data';
import {
  type OverviewAired,
  type OverviewFacts,
  hasDetails,
  overviewFacts,
} from '../../../src/anime/overview-facts';
import { CollapsibleSynopsis } from './synopsis';
import './overview.css';

const SYNOPSIS_ID = 'anime-synopsis';

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
      {synopsis.collapsible ? (
        <CollapsibleSynopsis id={SYNOPSIS_ID}>{paragraphs}</CollapsibleSynopsis>
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

function Aired({ aired }: { readonly aired: OverviewAired }) {
  const start = (
    <time dateTime={aired.start.datetime}>{aired.start.label}</time>
  );
  if (aired.kind === 'single') return start;
  return (
    <>
      {start} –{' '}
      {aired.kind === 'airing' ? (
        'now'
      ) : (
        <time dateTime={aired.end.datetime}>{aired.end.label}</time>
      )}
    </>
  );
}

function DetailsCard({ facts }: { readonly facts: OverviewFacts }) {
  const rows = [
    ['Format', facts.format],
    ['Episodes', facts.episodes],
    ['Aired', facts.aired && <Aired aired={facts.aired} />],
    ['Season', facts.season],
    [
      facts.studios.length > 1 ? 'Studios' : 'Studio',
      facts.studios.length > 0 ? facts.studios.join(', ') : null,
    ],
  ] as const;
  const shown = rows.filter(([, value]) => value !== null);
  return (
    <section className="ov-card ov-sec" aria-labelledby="ov-details-h">
      <div className="ov-sec__head">
        <h2 id="ov-details-h">Details</h2>
      </div>
      {shown.length > 0 && (
        <dl className="ov-facts">
          {shown.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {facts.genres.length > 0 && (
        <>
          <h3 className="ol-label ov-genres-h">Genres</h3>
          <ul className="ov-chips">
            {facts.genres.map((genre) => (
              <li key={genre}>
                <span className="ol-chip">{genre}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The Overview tab's content for a loaded anime: synopsis, then the facts column. */
export function Overview({ facts }: { readonly facts: OverviewFacts }) {
  const details = hasDetails(facts);
  return (
    <div className={details ? 'ov-grid' : 'ov-grid ov-grid--single'}>
      <div className="ov-main">
        <section className="ov-sec" aria-labelledby="ov-synopsis-h">
          <div className="ov-sec__head">
            <h2 id="ov-synopsis-h">Synopsis</h2>
          </div>
          <Synopsis synopsis={facts.synopsis} />
        </section>
      </div>
      {details && (
        <aside className="ov-side" aria-label="Key facts">
          <DetailsCard facts={facts} />
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
