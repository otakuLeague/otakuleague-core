import type { AnimeDetails, AnimeLink } from '@otakuleague/shared-types';
import { textOn } from './accent';
import { NAME_MAX_CHARS, displayText } from './overview-themes';

const LINKS_MAX = 12;
const URL_MAX_CHARS = 2048;

interface SiteBadge {
  /** Brand colour, "#rrggbb": the badge's fill; null keeps the neutral badge. */
  readonly color: string | null;
  readonly initial: string;
  /** The brand's own hosts (subdomains included); a link elsewhere is not shown as the brand. */
  readonly domains: readonly string[];
}

const brand = (
  color: string,
  initial: string,
  ...domains: string[]
): SiteBadge => ({ color, initial, domains });

/**
 * Known sites, keyed by `siteKey()` of AniList's site name, in the order they are listed.
 * Colours only fill a small badge; the site name stays in the page's text colour.
 */
export const SITE_BADGES: ReadonlyMap<string, SiteBadge> = new Map([
  ['crunchyroll', brand('#f47521', 'C', 'crunchyroll.com')],
  ['netflix', brand('#e50914', 'N', 'netflix.com')],
  ['hidive', brand('#00aeef', 'H', 'hidive.com')],
  ['hulu', brand('#1ce783', 'H', 'hulu.com')],
  ['disneyplus', brand('#113ccf', 'D', 'disneyplus.com')],
  [
    'amazonprimevideo',
    brand(
      '#00a8e1',
      'P',
      'primevideo.com',
      'amazon.com',
      'amazon.co.jp',
      'amazon.co.uk',
      'amazon.de',
      'amazon.fr',
    ),
  ],
  [
    'amazon',
    brand(
      '#00a8e1',
      'A',
      'amazon.com',
      'amazon.co.jp',
      'amazon.co.uk',
      'amazon.de',
      'amazon.fr',
      'primevideo.com',
    ),
  ],
  ['primevideo', brand('#00a8e1', 'P', 'primevideo.com', 'amazon.com')],
  ['funimation', brand('#5b0bb5', 'F', 'funimation.com')],
  ['bilibili', brand('#00a1d6', 'B', 'bilibili.com', 'bilibili.tv')],
  ['bilibilitv', brand('#00a1d6', 'B', 'bilibili.tv', 'bilibili.com')],
  ['iqiyi', brand('#00cc36', 'i', 'iq.com', 'iqiyi.com')],
  ['tubi', brand('#7408ff', 'T', 'tubitv.com')],
  ['wakanim', brand('#e3001b', 'W', 'wakanim.tv')],
  [
    'adn',
    brand(
      '#0096ff',
      'A',
      'animationdigitalnetwork.fr',
      'animationdigitalnetwork.com',
    ),
  ],
  [
    'animationdigitalnetwork',
    brand(
      '#0096ff',
      'A',
      'animationdigitalnetwork.fr',
      'animationdigitalnetwork.com',
    ),
  ],
  ['vrv', brand('#ffde00', 'V', 'vrv.co')],
  ['muse', brand('#e60012', 'M', 'youtube.com', 'museasia.com')],
  ['museasia', brand('#e60012', 'M', 'youtube.com', 'museasia.com')],
  ['aniplus', brand('#e4007f', 'A', 'aniplus-asia.com', 'aniplustv.com')],
  ['retrocrush', brand('#f6b21b', 'R', 'retrocrush.tv')],
  ['youtube', brand('#ff0000', 'Y', 'youtube.com', 'youtu.be')],
  ['officialsite', { color: null, initial: 'O', domains: [] }],
  ['twitter', brand('#1da1f2', 'T', 'twitter.com', 'x.com')],
  ['x', brand('#000000', 'X', 'x.com', 'twitter.com')],
  ['instagram', brand('#e1306c', 'I', 'instagram.com')],
  ['facebook', brand('#1877f2', 'F', 'facebook.com')],
  ['tiktok', brand('#000000', 'T', 'tiktok.com')],
  ['discord', brand('#5865f2', 'D', 'discord.gg', 'discord.com')],
]);
const SITE_ORDER: ReadonlyMap<string, number> = new Map(
  [...SITE_BADGES.keys()].map((key, index) => [key, index]),
);
/** Public DNS names only: no IP literal, no single label like `localhost`, no quotes. */
const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;

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

function neutralBadge(site: string): LinkBadge {
  const first = /[\p{L}\p{N}]/u.exec(site)?.[0];
  return { kind: 'neutral', initial: first?.toUpperCase() ?? '?' };
}

const onDomain = (hostname: string, domains: readonly string[]) =>
  domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

/** Only an http(s) URL to a public host name, without credentials, under 2,048 characters. */
function safeUrl(raw: string): URL | null {
  if (raw.length > URL_MAX_CHARS) return null;
  try {
    const url = new URL(raw.trim());
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    return web &&
      url.username === '' &&
      url.password === '' &&
      url.href.length <= URL_MAX_CHARS &&
      HOSTNAME.test(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

interface SiteLink {
  readonly url: string;
  readonly hostname: string;
  readonly site: string;
  readonly order: number;
  readonly kind: OfficialLink['kind'];
  readonly badge: LinkBadge;
}

/**
 * AniList's site name and badge, only when the host belongs to that brand; otherwise the host
 * name with a neutral badge.
 */
function siteLinkOf(link: AnimeLink): SiteLink | null {
  const url = safeUrl(link.url);
  if (url === null) return null;
  const { hostname } = url;
  const named = displayText(link.site, NAME_MAX_CHARS) ?? hostname;
  const key = siteKey(named);
  const known = SITE_BADGES.get(key);
  const mismatch =
    known !== undefined &&
    known.color !== null &&
    !onDomain(hostname, known.domains);
  const site = mismatch ? hostname : named;
  const badge: LinkBadge =
    known === undefined || known.color === null || mismatch
      ? neutralBadge(site)
      : {
          kind: 'brand',
          color: known.color,
          ink: textOn(known.color),
          initial: known.initial,
        };
  return {
    url: url.href,
    hostname,
    site,
    order: mismatch
      ? SITE_ORDER.size
      : (SITE_ORDER.get(key) ?? SITE_ORDER.size),
    kind: link.kind === 'streaming' ? 'streaming' : 'other',
    badge,
  };
}

/**
 * Streaming first, then known sites in `SITE_BADGES` order, then by name; a label shown twice
 * gets its host name ("Official Site · shingeki.tv").
 */
export function officialLinksOf(anime: AnimeDetails): readonly OfficialLink[] {
  const seen = new Set<string>();
  const links = (anime.links?.value ?? [])
    .flatMap((link) => {
      const parsed = siteLinkOf(link);
      if (parsed === null || seen.has(parsed.url)) return [];
      seen.add(parsed.url);
      return [parsed];
    })
    .sort(
      (a, b) =>
        Number(b.kind === 'streaming') - Number(a.kind === 'streaming') ||
        a.order - b.order ||
        a.site.localeCompare(b.site, 'en'),
    )
    .slice(0, LINKS_MAX)
    .map((link) => ({
      ...link,
      label: link.kind === 'streaming' ? `Watch on ${link.site}` : link.site,
    }));
  const counts = new Map<string, number>();
  for (const { label } of links)
    counts.set(label, (counts.get(label) ?? 0) + 1);
  return links.map(({ url, hostname, label, kind, badge }) => ({
    url,
    label: (counts.get(label) ?? 0) > 1 ? `${label} · ${hostname}` : label,
    kind,
    badge,
  }));
}
