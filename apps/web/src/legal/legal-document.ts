import type { Metadata } from 'next';
import { isValidElement, type ReactNode } from 'react';

// One template for /privacy, /terms and /data-sources (OTA-147, design docs/design/info/).
export const LEGAL_PAGES = [
  { path: '/privacy', label: 'Privacy policy' },
  { path: '/terms', label: 'Terms of use' },
  { path: '/data-sources', label: 'Data sources' },
] as const;

export type LegalPath = (typeof LEGAL_PAGES)[number]['path'];

export interface LegalSection {
  /** Anchor id: lowercase letters, digits and dashes, unique in its document. */
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
}

export interface LegalDocument {
  readonly path: LegalPath;
  readonly title: string;
  readonly description: string;
  /** ISO date (YYYY-MM-DD) of the last change that matters to readers. */
  readonly lastUpdated: string;
  /** "The short version": one sentence per item, shown above the first section. */
  readonly summary: readonly ReactNode[];
  readonly sections: readonly LegalSection[];
}

const WORDS_PER_MINUTE = 220;

/** Visible words of a React tree: text children and every text-bearing prop (table cells). */
export function wordCount(node: unknown): number {
  if (typeof node === 'string') {
    return node.split(/\s+/).filter((word) => word !== '').length;
  }
  if (typeof node === 'number') return 1;
  if (Array.isArray(node)) {
    return node.reduce<number>((total, child) => total + wordCount(child), 0);
  }
  if (isValidElement<Record<string, unknown>>(node)) {
    return Object.entries(node.props)
      .filter(([name]) => name !== 'href' && name !== 'className')
      .reduce((total, [, value]) => total + wordCount(value), 0);
  }
  return 0;
}

export function readingMinutes(document: LegalDocument): number {
  const words =
    wordCount(document.summary) +
    document.sections.reduce(
      (total, section) =>
        total + wordCount(section.title) + wordCount(section.body),
      0,
    );
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** "12 November 2026", read as a calendar date (never shifted by the server's time zone). */
export function formatLegalDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function legalMetadata(document: LegalDocument): Metadata {
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: document.path },
  };
}
