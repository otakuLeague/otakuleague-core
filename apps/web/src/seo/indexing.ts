import { EMAIL_VERIFICATION_LINK } from '@otakuleague/shared-types';

export type SearchIndexing = 'blocked' | 'allowed';

// beta.otakuleague.com is the production deploy of main, so no env var can tell it from the real site: OTA-149 flips this to 'allowed' at the launch cutover.
export const SEARCH_INDEXING: SearchIndexing = 'blocked';

export function robotsMetadata(indexing: SearchIndexing): {
  index: boolean;
  follow: boolean;
} {
  return indexing === 'blocked'
    ? { index: false, follow: false }
    : { index: true, follow: true };
}

export interface RobotsHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

// The meta tag alone is not enough: async generateMetadata streams into <body> and global-error has none.
export function robotsHeaders(indexing: SearchIndexing): RobotsHeaderRule[] {
  return indexing === 'blocked'
    ? [
        {
          source: '/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
      ]
    : [
        // The AniList id route only redirects: never an indexable page of its own (OTA-172).
        {
          source: '/anime/anilist/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
        // "Check your email" is a step of sign-up, never a search result (OTA-139, ADR 0015 1f-v2).
        {
          source: '/auth/check-email',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
        // The emailed link and its landings, the GET handler included (ADR 0015 1f-vi, decision 8).
        {
          source: `${EMAIL_VERIFICATION_LINK.path}/:path*`,
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
      ];
}
