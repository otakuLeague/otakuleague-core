import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  formatLegalDate,
  LEGAL_PAGES,
  type LegalDocument,
  type LegalSection,
  readingMinutes,
} from './legal-document';
import '../../app/styles/info.css';

/** A table that turns into one card per row on phones; each data cell labels itself. */
export function LegalTable({
  caption,
  columns,
  rows,
}: {
  readonly caption: string;
  readonly columns: readonly [string, ...string[]];
  /** The first cell of a row is its header (the row's name). */
  readonly rows: readonly (readonly [ReactNode, ...ReactNode[]])[];
}) {
  return (
    <div className="lg-wrap">
      <table className="lg-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, ...cells], row) => (
            // Rows are static content, never reordered: the index is a stable key.
            <tr key={row}>
              <th scope="row">{name}</th>
              {cells.map((cell, index) => (
                <td key={columns[index + 1]} data-label={columns[index + 1]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TocList({ sections }: { readonly sections: readonly LegalSection[] }) {
  return (
    <ol>
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>{section.title}</a>
        </li>
      ))}
    </ol>
  );
}

export function LegalPage({ document }: { readonly document: LegalDocument }) {
  const updated = (
    <time dateTime={document.lastUpdated}>
      {formatLegalDate(document.lastUpdated)}
    </time>
  );
  return (
    <main className="in-page">
      <div className="lg" id="top">
        <header className="lg-head">
          <nav aria-label="Legal pages">
            <ul className="lg-sib">
              {LEGAL_PAGES.map((page) => (
                <li key={page.path}>
                  <Link
                    href={page.path}
                    aria-current={
                      page.path === document.path ? 'page' : undefined
                    }
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <h1>{document.title}</h1>
          <p className="lg-meta">
            <span>Last updated {updated}</span>
            <span>About {readingMinutes(document)} min read</span>
          </p>
        </header>
        <aside>
          {/* Desktop: sticky list. Phones: the collapsed disclosure below (CSS shows one). */}
          <nav className="lg-toc" aria-labelledby="toc-heading">
            <h2 className="ol-label" id="toc-heading">
              On this page
            </h2>
            <TocList sections={document.sections} />
            <a className="lg-top" href="#top">
              Back to top ↑
            </a>
          </nav>
          <details className="lg-toc-m">
            <summary>On this page</summary>
            <nav aria-label="On this page">
              <TocList sections={document.sections} />
            </nav>
          </details>
        </aside>
        <article className="lg-doc">
          <section className="lg-tldr" aria-labelledby="tldr-heading">
            <h2 id="tldr-heading">The short version</h2>
            <ul>
              {document.summary.map((point, index) => (
                // Static content, never reordered: the index is a stable key.
                <li key={index}>{point}</li>
              ))}
            </ul>
          </section>
          {document.sections.map((section) => (
            <div key={section.id}>
              <div className="lg-h">
                <h2 id={section.id}>{section.title}</h2>
                <a
                  className="lg-anchor"
                  href={`#${section.id}`}
                  aria-label={`Link to ${section.title}`}
                >
                  #
                </a>
              </div>
              {section.body}
            </div>
          ))}
          <div className="lg-end">
            <span>Last updated {updated}</span>
            <a href="#top">Back to top ↑</a>
          </div>
        </article>
      </div>
    </main>
  );
}
