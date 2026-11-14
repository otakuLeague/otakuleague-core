import type { MetadataRoute } from 'next';
import { SEARCH_INDEXING } from '../src/seo/indexing';
import { robotsRules } from '../src/seo/site';

export default function robots(): MetadataRoute.Robots {
  return robotsRules(SEARCH_INDEXING);
}
