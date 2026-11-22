import Link from 'next/link';
import { type CSSProperties, Fragment, type ReactNode } from 'react';
import { loadAnime } from '../../../src/anime/data';
import {
  type InformationRow,
  type OverviewFacts,
  informationRows,
  overviewFacts,
} from '../../../src/anime/overview-facts';
import type { OfficialLink } from '../../../src/anime/link-sites';
import type {
  AltTitle,
  OverviewThemes,
} from '../../../src/anime/overview-themes';
import type { OverviewTrailer } from '../../../src/anime/trailer';
import { SpoilerTags } from './spoiler-tags';
import { CollapsibleSynopsis } from './synopsis';
import { TagChip } from './tag-chip';
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
      <div className="ov-trailer__meta">
        {/* Named before the press: playing loads the host's player (privacy#trailers). */}
        <p>
          Plays from {trailer.siteLabel} ·{' '}
          <Link href="/privacy#trailers">Privacy</Link>
        </p>
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
      </div>
    </section>
  );
}

const SPOILERS_ID = 'ov-spoiler-tags';
/** Without JS the spoiler toggle can't work: hide it, and the spoiler tags stay hidden. */
const NO_JS_SPOILERS = '.ov-spoiler-toggle{display:none!important}';

function ChipList({ children }: { readonly children: ReactNode }) {
  return <ul className="ov-chips">{children}</ul>;
}

/** Genres, then tags; plain chips until browse routes exist. */
function GenresAndThemes({ themes }: { readonly themes: OverviewThemes }) {
  const open = themes.tags.filter((tag) => tag.visibility === 'open');
  const spoilers = themes.tags.filter((tag) => tag.visibility === 'spoiler');
  return (
    <section className="ov-sec ov-sec--themes" aria-labelledby="ov-themes-h">
      <div className="ov-sec__head">
        <h2 id="ov-themes-h">Genres &amp; themes</h2>
      </div>
      {themes.genres.length > 0 && (
        <div className="ov-group">
          <h3 className="ov-sub">Genres</h3>
          <ChipList>
            {themes.genres.map((genre) => (
              <li key={genre}>
                <span className="ol-chip">{genre}</span>
              </li>
            ))}
          </ChipList>
        </div>
      )}
      {themes.tags.length > 0 && (
        <div className="ov-group">
          <h3 className="ov-sub">Themes</h3>
          {open.length > 0 && (
            <ChipList>
              {open.map((tag) => (
                <li key={tag.name}>
                  <TagChip tag={tag} />
                </li>
              ))}
            </ChipList>
          )}
          {spoilers.length > 0 && (
            <>
              <SpoilerTags id={SPOILERS_ID} tags={spoilers} />
              <noscript>
                <style>{NO_JS_SPOILERS}</style>
              </noscript>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const ALT_TITLE_LABELS: Readonly<Record<AltTitle['kind'], string>> = {
  romaji: 'Romaji',
  english: 'English',
  native: 'Native',
  synonym: 'Also known as',
};

/** One label per kind; every synonym is its own value under "Also known as". */
function AlternativeTitles({
  titles,
}: {
  readonly titles: readonly AltTitle[];
}) {
  const kinds = [...new Set(titles.map((title) => title.kind))];
  return (
    <section className="ov-sec ov-sec--alt" aria-labelledby="ov-alt-h">
      <div className="ov-sec__head">
        <h2 id="ov-alt-h">Alternative titles</h2>
      </div>
      <dl className="ov-facts ov-alt">
        {kinds.map((kind) => (
          <Fragment key={kind}>
            <dt>{ALT_TITLE_LABELS[kind]}</dt>
            {titles
              .filter((title) => title.kind === kind)
              .map((title) => (
                <dd key={title.text}>
                  {kind === 'native' ? <bdi>{title.text}</bdi> : title.text}
                </dd>
              ))}
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

function OfficialLinks({ links }: { readonly links: readonly OfficialLink[] }) {
  return (
    <section
      className="ov-card ov-sec ov-sec--links"
      aria-labelledby="ov-links-h"
    >
      <div className="ov-sec__head">
        <h2 id="ov-links-h">Official links</h2>
      </div>
      <ul className="ov-links">
        {links.map((link) => (
          <li key={link.url}>
            <a
              className="ov-link"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span
                className="ov-link__badge"
                aria-hidden="true"
                style={
                  link.badge.kind === 'brand'
                    ? ({
                        '--ov-badge': link.badge.color,
                        '--ov-badge-ink': link.badge.ink,
                      } as CSSProperties)
                    : undefined
                }
              >
                {link.badge.initial}
              </span>
              <span className="ov-link__name">{link.label}</span>
              <span className="anime-sr-only"> (opens in a new tab)</span>
              <span className="ov-link__arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
      {links.some((link) => link.kind === 'streaming') && (
        <p className="ov-note">
          Streaming availability depends on your country.
        </p>
      )}
    </section>
  );
}

/** Text only, never a link or control: on phones its wrapper is `display: contents` and reordered. */
function InformationCard({
  rows,
}: {
  readonly rows: readonly InformationRow[];
}) {
  return (
    <section className="ov-card ov-sec ov-sec--info">
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
 * The Overview tab for a loaded anime. Main column: trailer, synopsis, genres & themes,
 * alternative titles; side: Information, official links. On phones both wrappers dissolve and
 * CSS orders trailer, synopsis, information, genres & themes, alternative titles, links.
 */
export function Overview({ facts }: { readonly facts: OverviewFacts }) {
  const rows = informationRows(facts);
  const hasSide = rows.length > 0 || facts.links.length > 0;
  const { themes } = facts;
  return (
    <div className={hasSide ? 'ov-grid' : 'ov-grid ov-grid--single'}>
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
        {(themes.genres.length > 0 || themes.tags.length > 0) && (
          <GenresAndThemes themes={themes} />
        )}
        {facts.altTitles.length > 0 && (
          <AlternativeTitles titles={facts.altTitles} />
        )}
      </div>
      {hasSide && (
        <aside className="ov-side" aria-label="Details">
          {rows.length > 0 && <InformationCard rows={rows} />}
          {facts.links.length > 0 && <OfficialLinks links={facts.links} />}
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
