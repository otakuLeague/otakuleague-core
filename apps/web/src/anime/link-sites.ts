import type { AnimeDetails } from '@otakuleague/shared-types';
import { textOn } from './accent';

const LINKS_MAX = 12;
const URL_MAX_CHARS = 2048;

interface SiteBadge {
  /** Brand colour, "#rrggbb": the badge's fill. */
  readonly color: string;
  readonly initial: string;
}

/**
 * Known sites, keyed by `siteKey()` of AniList's site name, in the order they are listed.
 * Colours only fill a small badge; the site name stays in the page's text colour.
 */
export const SITE_BADGES: ReadonlyMap<string, SiteBadge> = new Map([
  ['crunchyroll', { color: '#f47521', initial: 'C' }],
  ['netflix', { color: '#e50914', initial: 'N' }],
  ['hidive', { color: '#00aeef', initial: 'H' }],
  ['hulu', { color: '#1ce783', initial: 'H' }],
  ['disneyplus', { color: '#113ccf', initial: 'D' }],
  ['amazonprimevideo', { color: '#00a8e1', initial: 'P' }],
  ['amazon', { color: '#00a8e1', initial: 'A' }],
  ['primevideo', { color: '#00a8e1', initial: 'P' }],
  ['funimation', { color: '#5b0bb5', initial: 'F' }],
  ['bilibili', { color: '#00a1d6', initial: 'B' }],
  ['bilibilitv', { color: '#00a1d6', initial: 'B' }],
  ['iqiyi', { color: '#00cc36', initial: 'i' }],
  ['tubi', { color: '#7408ff', initial: 'T' }],
  ['wakanim', { color: '#e3001b', initial: 'W' }],
  ['adn', { color: '#0096ff', initial: 'A' }],
  ['animationdigitalnetwork', { color: '#0096ff', initial: 'A' }],
  ['vrv', { color: '#ffde00', initial: 'V' }],
  ['muse', { color: '#e60012', initial: 'M' }],
  ['museasia', { color: '#e60012', initial: 'M' }],
  ['aniplus', { color: '#e4007f', initial: 'A' }],
  ['retrocrush', { color: '#f6b21b', initial: 'R' }],
  ['youtube', { color: '#ff0000', initial: 'Y' }],
  ['officialsite', { color: '#8a7dff', initial: 'O' }],
  ['twitter', { color: '#1da1f2', initial: 'T' }],
  ['x', { color: '#000000', initial: 'X' }],
  ['instagram', { color: '#e1306c', initial: 'I' }],
  ['facebook', { color: '#1877f2', initial: 'F' }],
  ['tiktok', { color: '#000000', initial: 'T' }],
  ['discord', { color: '#5865f2', initial: 'D' }],
]);
const SITE_ORDER = [...SITE_BADGES.keys()];

export type LinkBadge =
  | {
      readonly kind: 'brand';
      readonly color: string;
      /** Text on `color`, at least 4.5:1. */
      readonly ink: string;
      readonly initial: string;
    }
  | { readonly kind: 'neutral'; readonly initial: string };

export interface OfficialLink {
  /** Re-serialised from a parsed http(s) URL. */
  readonly url: string;
  readonly label: string;
  readonly kind: 'streaming' | 'other';
  readonly badge: LinkBadge;
}

/** "Disney Plus" and "Disney+" → "disneyplus"; "X" → "x". */
export function siteKey(site: string): string {
  return site
    .toLowerCase()
    .replace(/\+/gu, 'plus')
    .replace(/[^a-z0-9]/gu, '');
}

function badgeOf(site: string): LinkBadge {
  const known = SITE_BADGES.get(siteKey(site));
  if (known !== undefined) {
    return { kind: 'brand', ...known, ink: textOn(known.color) };
  }
  const first = /[\p{L}\p{N}]/u.exec(site)?.[0];
  return { kind: 'neutral', initial: first?.toUpperCase() ?? '?' };
}

/** Only an http(s) URL without credentials, under 2,048 characters; never `javascript:` or `data:`. */
function safeUrl(raw: string): URL | null {
  if (raw.length > URL_MAX_CHARS) return null;
  try {
    const url = new URL(raw.trim());
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    return web && url.username === '' && url.password === '' ? url : null;
  } catch {
    return null;
  }
}

/** Streaming first, then known sites in `SITE_BADGES` order, then by name. */
export function officialLinksOf(anime: AnimeDetails): readonly OfficialLink[] {
  const seen = new Set<string>();
  const parsed = (anime.links?.value ?? []).flatMap((link) => {
    const url = safeUrl(link.url);
    if (url === null || seen.has(url.href)) return [];
    seen.add(url.href);
    const site = link.site.trim() || url.hostname;
    const order = SITE_ORDER.indexOf(siteKey(site));
    return [{ link, url: url.href, site, order }];
  });
  const rank = (order: number) => (order === -1 ? SITE_ORDER.length : order);
  return parsed
    .sort(
      (a, b) =>
        Number(b.link.kind === 'streaming') -
          Number(a.link.kind === 'streaming') ||
        rank(a.order) - rank(b.order) ||
        a.site.localeCompare(b.site, 'en'),
    )
    .slice(0, LINKS_MAX)
    .map(({ link, url, site }) => ({
      url,
      label: link.kind === 'streaming' ? `Watch on ${site}` : site,
      kind: link.kind === 'streaming' ? 'streaming' : 'other',
      badge: badgeOf(site),
    }));
}
