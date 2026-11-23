import type { AnimeDetails, AnimeTrailer } from '@otakuleague/shared-types';
import { imageSrc } from './image-src';

const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const YOUTUBE_WATCH_ORIGIN = 'https://www.youtube.com';
const DAILYMOTION_ORIGIN = 'https://www.dailymotion.com';

/** Hosts the trailer iframe may load from, for a future `frame-src` (OTA-214). */
export const TRAILER_EMBED_ORIGINS = [
  YOUTUBE_EMBED_ORIGIN,
  DAILYMOTION_ORIGIN,
] as const;

export type TrailerPoster =
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'placeholder' };

/** A trailer we can embed: ids are checked, so every URL is built from known parts only. */
export interface OverviewTrailer {
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
  // The API is trusted for shape but not content: anything unexpected means no trailer.
  if (typeof trailer.id !== 'string') return null;
  switch (trailer.site) {
    case 'youtube':
      return YOUTUBE_ID.test(trailer.id)
        ? {
            siteLabel: 'YouTube',
            embedUrl: `${YOUTUBE_EMBED_ORIGIN}/embed/${trailer.id}?autoplay=1`,
            watchUrl: `${YOUTUBE_WATCH_ORIGIN}/watch?v=${trailer.id}`,
          }
        : null;
    case 'dailymotion':
      return DAILYMOTION_ID.test(trailer.id)
        ? {
            siteLabel: 'Dailymotion',
            embedUrl: `${DAILYMOTION_ORIGIN}/embed/video/${trailer.id}?autoplay=1`,
            watchUrl: `${DAILYMOTION_ORIGIN}/video/${trailer.id}`,
          }
        : null;
    default:
      // Fails closed: a site added to the shared type must be handled here first.
      trailer.site satisfies never;
      return null;
  }
}

/** The poster behind the play button: the banner, else the cover, else a plain panel. */
function posterOf(anime: AnimeDetails): TrailerPoster {
  const url =
    imageSrc(anime.bannerImageUrl?.value) ??
    imageSrc(anime.coverImageUrl?.value);
  return url === null ? { kind: 'placeholder' } : { kind: 'image', url };
}

/** The anime's trailer, or null when there is none or its id is malformed. */
export function trailerOf(anime: AnimeDetails): OverviewTrailer | null {
  const trailer = anime.trailer?.value;
  if (trailer === undefined) return null;
  const urls = urlsOf(trailer);
  if (urls === null) return null;
  return { ...urls, poster: posterOf(anime) };
}
