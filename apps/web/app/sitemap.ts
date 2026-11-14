import type { MetadataRoute } from 'next';
import { sitemapEntries } from '../src/seo/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
