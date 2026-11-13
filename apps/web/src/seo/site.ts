import type { MetadataRoute } from 'next';
import { LEGAL_PAGES } from '../legal/legal-document';
import type { SearchIndexing } from './indexing';

// A constant on purpose: beta and prod are the same build, so the Vercel default URL would point canonicals at beta.
export const SITE_URL = 'https://otakuleague.com';

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

// Static pages only: anime pages are imported on demand and no DB-only list endpoint exists yet (ADR 0018).
const SITEMAP_PATHS: readonly string[] = [
  '/',
  '/faq',
  ...LEGAL_PAGES.map((page) => page.path),
];

export function robotsRules(indexing: SearchIndexing): MetadataRoute.Robots {
  const rules = { userAgent: '*', disallow: '/anime/anilist/' };
  return indexing === 'allowed'
    ? { rules, sitemap: absoluteUrl('/sitemap.xml') }
    : { rules };
}

export function sitemapEntries(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: absoluteUrl(path) }));
}
