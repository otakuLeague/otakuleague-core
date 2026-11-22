import type { AnimeDetails, AnimeTrailer } from '@otakuleague/shared-types';

/** Hosts the trailer iframe may load from, for a future `frame-src` (OTA-214). */
export const TRAILER_EMBED_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://www.dailymotion.com',
] as const;

export type TrailerPoster =
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'placeholder' };

/** A trailer we can embed: ids are checked, so every URL is built from known parts only. */
export interface OverviewTrailer {
  readonly site: AnimeTrailer['site'];
  readonly siteLabel: string;
  /** Loaded only after a press on play. */
  readonly embedUrl: string;
  /** The no-JS fallback and "watch on" link. */
  readonly watchUrl: string;
  readonly poster: TrailerPoster;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
const DAILYMOTION_ID = /^[a-zA-Z0-9]{1,32}$/u;

function urlsOf(
  trailer: AnimeTrailer,
): Pick<OverviewTrailer, 'siteLabel' | 'embedUrl' | 'watchUrl'> | null {
  switch (trailer.site) {
    case 'youtube':
      return YOUTUBE_ID.test(trailer.id)
        ? {
            siteLabel: 'YouTube',
            embedUrl: `https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1`,
            watchUrl: `https://www.youtube.com/watch?v=${trailer.id}`,
          }
        : null;
    case 'dailymotion':
      return DAILYMOTION_ID.test(trailer.id)
        ? {
            siteLabel: 'Dailymotion',
            embedUrl: `https://www.dailymotion.com/embed/video/${trailer.id}?autoplay=1`,
            watchUrl: `https://www.dailymotion.com/video/${trailer.id}`,
          }
        : null;
    default: {
      const unknown: never = trailer.site;
      return unknown;
    }
  }
}

function httpsUrl(url: string | undefined): string | null {
  return url !== undefined && url.startsWith('https://') ? url : null;
}

/** The poster behind the play button: the banner, else the cover, else a plain panel. */
function posterOf(anime: AnimeDetails): TrailerPoster {
  const url =
    httpsUrl(anime.bannerImageUrl?.value) ??
    httpsUrl(anime.coverImageUrl?.value);
  return url === null ? { kind: 'placeholder' } : { kind: 'image', url };
}

/** The anime's trailer, or null when there is none or its id is malformed. */
export function trailerOf(anime: AnimeDetails): OverviewTrailer | null {
  const trailer = anime.trailer?.value;
  if (trailer === undefined) return null;
  const urls = urlsOf(trailer);
  if (urls === null) return null;
  return { site: trailer.site, ...urls, poster: posterOf(anime) };
}
