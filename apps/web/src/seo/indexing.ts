import type { Metadata } from 'next';

export type SearchIndexing = 'blocked' | 'allowed';

// beta.otakuleague.com is the production deploy of main, so no env var can tell it from the real site: OTA-149 flips this to 'allowed' at the launch cutover.
export const SEARCH_INDEXING: SearchIndexing = 'blocked';

export function robotsMetadata(indexing: SearchIndexing): Metadata['robots'] {
  return indexing === 'blocked'
    ? { index: false, follow: false }
    : { index: true, follow: true };
}
