/** Where a stored value came from (ADR 0006). Each one can be switched off on its own. */
export const ANIME_DATA_SOURCES = ['anilist', 'jikan'] as const;
export type AnimeDataSource = (typeof ANIME_DATA_SOURCES)[number];

/** Id namespaces: an anime is reachable by its AniList id or its MyAnimeList id. */
export const ANIME_ID_SOURCES = ['anilist', 'myanimelist'] as const;
export type AnimeIdSource = (typeof ANIME_ID_SOURCES)[number];

export const ANIME_FORMATS = [
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
] as const;
export type AnimeFormat = (typeof ANIME_FORMATS)[number];
export const ANIME_STATUSES = [
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
] as const;
export type AnimeStatus = (typeof ANIME_STATUSES)[number];
export const ANIME_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type AnimeSeason = (typeof ANIME_SEASONS)[number];

/** Sources often know only the year, or the year and month. */
export interface PartialDate {
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
}

/** A value with the source it came from and when it was fetched (ISO 8601). */
export interface Sourced<T> {
  readonly value: T;
  readonly source: AnimeDataSource;
  readonly fetchedAt: string;
}

export interface AnimeTag {
  readonly name: string;
  /** 0-100, how relevant the tag is; null when the source has no rank. */
  readonly rank: number | null;
  readonly spoiler: boolean;
}

export interface AnimeStudio {
  readonly name: string;
  readonly main: boolean;
}

export interface AnimeLink {
  readonly site: string;
  readonly url: string;
  readonly kind: 'streaming' | 'other';
}

export interface AnimeTrailer {
  readonly site: 'youtube' | 'dailymotion';
  readonly id: string;
}

export interface AnimeNextEpisode {
  readonly episode: number;
  /** ISO 8601. */
  readonly airingAt: string;
}

/** One source's score. Scores from two sources are listed side by side, never averaged. */
export interface AnimeScore {
  readonly source: AnimeDataSource;
  readonly fetchedAt: string;
  readonly score: number;
  /** AniList scores out of 100, MyAnimeList out of 10. */
  readonly scale: 10 | 100;
  readonly scoredBy: number | null;
  readonly rank: number | null;
  /** Users who have the anime in a list on that site. */
  readonly members: number | null;
}

/** A source shown on the page: required attribution and a link back. */
export interface AnimeAttribution {
  readonly source: AnimeDataSource;
  readonly url: string;
  readonly fetchedAt: string;
}

/** GET /anime/:idSource/:externalId. A field is null when no enabled source has it. */
export interface AnimeDetails {
  readonly id: string;
  /** Its URL slug (ADR 0007); null until the anime has an AniList identity. */
  readonly canonicalSlug: string | null;
  readonly externalIds: readonly {
    readonly source: AnimeIdSource;
    readonly id: string;
  }[];
  readonly titleRomaji: Sourced<string> | null;
  readonly titleEnglish: Sourced<string> | null;
  readonly titleNative: Sourced<string> | null;
  readonly synonyms: Sourced<readonly string[]> | null;
  readonly format: Sourced<AnimeFormat> | null;
  readonly status: Sourced<AnimeStatus> | null;
  readonly startDate: Sourced<PartialDate> | null;
  readonly endDate: Sourced<PartialDate> | null;
  readonly season: Sourced<AnimeSeason> | null;
  readonly seasonYear: Sourced<number> | null;
  readonly episodes: Sourced<number> | null;
  readonly durationMinutes: Sourced<number> | null;
  /** Plain text, paragraphs separated by blank lines. Never HTML. */
  readonly synopsis: Sourced<string> | null;
  readonly coverImageUrl: Sourced<string> | null;
  readonly bannerImageUrl: Sourced<string> | null;
  readonly trailer: Sourced<AnimeTrailer> | null;
  readonly genres: Sourced<readonly string[]> | null;
  readonly tags: Sourced<readonly AnimeTag[]> | null;
  readonly studios: Sourced<readonly AnimeStudio[]> | null;
  readonly links: Sourced<readonly AnimeLink[]> | null;
  readonly nextEpisode: Sourced<AnimeNextEpisode> | null;
  /**
   * The work's original creators: "Original Creator" / "Original Story" staff, plus "Original
   * Character Design" next to an "Original Story" credit (split writer/artist manga).
   */
  readonly creators: Sourced<readonly string[]> | null;
  /** Users who marked it a favourite on the source. */
  readonly favourites: Sourced<number> | null;
  /**
   * AniList's all-time rank among anime of the same `format`, by score ("#12 highest rated
   * TV anime") and by popularity. Unrelated to `scores[].rank` (MyAnimeList, all formats).
   */
  readonly rankRated: Sourced<number> | null;
  readonly rankPopular: Sourced<number> | null;
  /** Dominant colour of the cover, "#rrggbb": the page's accent. */
  readonly coverColor: Sourced<string> | null;
  readonly scores: readonly AnimeScore[];
  readonly attributions: readonly AnimeAttribution[];
}

/**
 * GET /anime/slugs/:slug (ADR 0007). Any slug other than the canonical one (alias, former
 * canonical, other letter case) answers a redirect as data: the web client refuses HTTP
 * redirects, so the web app sends the 301 itself.
 */
export type AnimeBySlug =
  | { readonly kind: 'anime'; readonly anime: AnimeDetails }
  | { readonly kind: 'redirect'; readonly canonicalSlug: string };

/** AniList format of a franchise entry: an anime format, or a manga's for source material. */
export type MediaFormat = AnimeFormat | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

/**
 * ADR 0008. `walking`: entries are still being fetched, ask again later; `partial`: AniList
 * just left an entry out, the list may be incomplete for a while; `truncated`: the franchise
 * is larger than the node cap; `unavailable`: AniList is switched off.
 */
export type FranchiseState =
  'complete' | 'walking' | 'partial' | 'truncated' | 'unavailable';

export interface FranchiseEntry {
  readonly anilistId: number;
  readonly mediaType: 'ANIME' | 'MANGA';
  /** Null until the anime is imported (link /anime/anilist/:id then); always null for manga. */
  readonly slug: string | null;
  /** English, else romaji. */
  readonly title: string;
  readonly format: MediaFormat | null;
  readonly status: AnimeStatus | null;
  readonly startDate: PartialDate | null;
  readonly coverImageUrl: string | null;
}

export interface FranchiseSeason extends FranchiseEntry {
  readonly label: string;
  /** The entry the request named. */
  readonly isCurrent: boolean;
}

export const FRANCHISE_RELATED_GROUPS = [
  'movie',
  'ova',
  'special',
  'ona',
  'tv',
  'music',
  'spin_off',
  'source',
  'other',
] as const;
export type FranchiseRelatedGroupName =
  (typeof FRANCHISE_RELATED_GROUPS)[number];

export interface FranchiseRelatedGroup {
  readonly group: FranchiseRelatedGroupName;
  /** At most 50, by air date. */
  readonly entries: readonly FranchiseEntry[];
  readonly total: number;
}

/** GET /anime/slugs/:slug/franchise (ADR 0008): the season selector and the Related tab. */
export interface AnimeFranchise {
  readonly state: FranchiseState;
  /** Always holds the anime being viewed once it is cached (alone while it has no relations). */
  readonly mainLine: readonly FranchiseSeason[];
  readonly related: readonly FranchiseRelatedGroup[];
}
