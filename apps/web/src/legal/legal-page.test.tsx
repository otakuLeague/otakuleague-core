import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA_SOURCES } from './data-sources';
import {
  formatLegalDate,
  type LegalDocument,
  legalMetadata,
  readingMinutes,
  wordCount,
} from './legal-document';
import { LegalPage, LegalTable } from './legal-page';
import { PRIVACY_POLICY } from './privacy';
import { TERMS_OF_USE } from './terms';

const DOCUMENTS = [PRIVACY_POLICY, TERMS_OF_USE, DATA_SOURCES] as const;

function sectionIds(container: HTMLElement) {
  return [...container.querySelectorAll('.lg-doc h2[id]')]
    .map((heading) => heading.id)
    .filter((id) => id !== 'tldr-heading');
}

describe.each(DOCUMENTS)('$title', (document) => {
  afterEach(cleanup);

  it('links every table-of-contents entry to a heading, in order, with unique anchors', () => {
    const { container } = render(<LegalPage document={document} />);

    const ids = sectionIds(container);
    expect(ids).toEqual(document.sections.map((section) => section.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

    const desktop = container.querySelector('nav.lg-toc');
    const phone = container.querySelector('.lg-toc-m');
    for (const toc of [desktop, phone]) {
      expect(
        [...(toc?.querySelectorAll('ol a') ?? [])].map((link) =>
          link.getAttribute('href'),
        ),
      ).toEqual(ids.map((id) => `#${id}`));
    }
    expect(phone?.tagName).toBe('DETAILS');
    expect(phone?.hasAttribute('open')).toBe(false);
  });

  it('gives every heading a labelled anchor that keeps the heading name clean', () => {
    render(<LegalPage document={document} />);

    for (const section of document.sections) {
      expect(
        screen.getByRole('heading', { level: 2, name: section.title }).id,
      ).toBe(section.id);
      expect(
        screen
          .getByRole('link', { name: `Link to ${section.title}` })
          .getAttribute('href'),
      ).toBe(`#${section.id}`);
    }
  });

  it('shows the title, last-updated date, reading time and the current sibling tab', () => {
    const { container } = render(<LegalPage document={document} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      document.title,
    );
    const times = container.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0]?.getAttribute('dateTime')).toBe(document.lastUpdated);
    expect(screen.getByText(/^About \d+ min read$/)).toBeDefined();

    const tabs = screen.getByRole('navigation', { name: 'Legal pages' });
    const current = within(tabs)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.getAttribute('href'))).toEqual([
      document.path,
    ]);
  });

  it('has a title, description and canonical URL', () => {
    const metadata = legalMetadata(document);
    expect(metadata.title).toBe(document.title);
    expect(metadata.description).toBe(document.description);
    expect(metadata.alternates?.canonical).toBe(document.path);
  });
});

describe('legal tables', () => {
  afterEach(cleanup);

  it('render a caption, column headers and self-labelled cells', () => {
    render(<LegalPage document={PRIVACY_POLICY} />);

    const cookies = screen.getByRole('table', { name: 'Cookies we set' });
    expect(
      within(cookies)
        .getAllByRole('columnheader')
        .map((header) => [header.textContent, header.getAttribute('scope')]),
    ).toEqual([
      ['Name', 'col'],
      ['Why', 'col'],
      ['How long', 'col'],
    ]);
    const session = within(cookies).getByRole('rowheader', {
      name: '__Host-ol_session',
    });
    expect(session.getAttribute('scope')).toBe('row');
    const cells = within(session.closest('tr') as HTMLElement).getAllByRole(
      'cell',
    );
    expect(cells.map((cell) => cell.dataset.label)).toEqual([
      'Why',
      'How long',
    ]);
    expect(screen.getByRole('table', { name: 'Processors' })).toBeDefined();
  });

  it('render a single-column table without data cells', () => {
    render(
      <LegalTable caption="Only names" columns={['Name']} rows={[['A']]} />,
    );

    expect(screen.getByRole('rowheader', { name: 'A' })).toBeDefined();
    expect(screen.queryAllByRole('cell')).toHaveLength(0);
  });
});

describe('privacy facts', () => {
  afterEach(cleanup);

  it('lists the processors and every essential cookie, and credits only AniList as a source', () => {
    const { container: privacy } = render(
      <LegalPage document={PRIVACY_POLICY} />,
    );
    for (const name of ['Vercel', 'Railway', 'Sentry', 'Brevo']) {
      expect(screen.getByRole('rowheader', { name })).toBeDefined();
    }
    for (const cookie of [
      '__Host-ol_session',
      'ol_flash',
      'ol_signup',
      'ol_verify',
      'ol_reset',
      'ol_oauth',
      'ol-theme',
    ]) {
      expect(privacy.textContent).toContain(cookie);
    }
    cleanup();

    const { container: sources } = render(
      <LegalPage document={DATA_SOURCES} />,
    );
    expect(sources.textContent).toContain('AniList');
    expect(sources.textContent).not.toMatch(/MyAnimeList|AnimeThemes/);
  });
});

describe('long content', () => {
  afterEach(cleanup);

  const longDocument: LegalDocument = {
    path: '/terms',
    title: 'A very long policy',
    description: 'Long',
    lastUpdated: '2026-02-28',
    summary: ['One point.'],
    sections: Array.from({ length: 30 }, (_, index) => ({
      id: `section-${index + 1}`,
      title: `Section ${index + 1} with a deliberately long title that has to wrap in the table of contents`,
      body: <p>{'word '.repeat(400)}</p>,
    })),
  };

  it('renders every section in both tables of contents and estimates the reading time', () => {
    const { container } = render(<LegalPage document={longDocument} />);

    expect(sectionIds(container)).toHaveLength(30);
    expect(container.querySelectorAll('.lg-toc ol a')).toHaveLength(30);
    expect(container.querySelectorAll('.lg-toc-m ol a')).toHaveLength(30);
    expect(readingMinutes(longDocument)).toBe(57);
    expect(screen.getByText('About 57 min read')).toBeDefined();
  });
});

describe('legal helpers', () => {
  it('counts words in text, nested elements and table props, not in URLs', () => {
    expect(wordCount('  two   words ')).toBe(2);
    expect(wordCount(null)).toBe(0);
    expect(
      wordCount(
        <p>
          one <a href="https://example.com/a b c">two three</a>
        </p>,
      ),
    ).toBe(3);
    expect(
      wordCount(
        <LegalTable caption="Cap tion" columns={['A']} rows={[['b c']]} />,
      ),
    ).toBe(5);
  });

  it('never rounds the reading time down to zero', () => {
    expect(
      readingMinutes({
        ...TERMS_OF_USE,
        summary: [],
        sections: [{ id: 'a', title: 'A', body: 'b' }],
      }),
    ).toBe(1);
  });

  it('formats the date as a calendar day', () => {
    expect(formatLegalDate('2026-11-12')).toBe('12 November 2026');
    expect(formatLegalDate('2026-01-01')).toBe('1 January 2026');
  });
});
