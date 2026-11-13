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

export const ANIME_TITLE_KINDS = [
  'english',
  'romaji',
  'native',
  'synonym',
] as const;
export type AnimeTitleKind = (typeof ANIME_TITLE_KINDS)[number];

/** One anime in GET /anime/search (ADR 0016). */
export interface AnimeSearchHit {
  /** Canonical slug (ADR 0007); null when the anime has no AniList identity: link by `ref`. */
  readonly slug: string | null;
  /** The AniList id when visible, else the MyAnimeList id. */
  readonly ref: { readonly source: AnimeIdSource; readonly id: string };
  /** English, else romaji, else native, else the matched title. */
  readonly title: string;
  /** Always present. The card shows "Also known as" when `text` differs from `title`. */
  readonly matchedTitle: {
    readonly kind: AnimeTitleKind;
    readonly text: string;
  };
  readonly format: AnimeFormat | null;
  readonly episodes: number | null;
  readonly season: AnimeSeason | null;
  readonly seasonYear: number | null;
  readonly startYear: number | null;
  readonly coverImageUrl: string | null;
  readonly coverColor: string | null;
  /** The first visible source's score, with its label (scores are never mixed, ADR 0006). */
  readonly score: Pick<AnimeScore, 'source' | 'score' | 'scale'> | null;
}

export interface AnimeSearchPage {
  readonly hits: readonly AnimeSearchHit[];
  readonly page: number;
  readonly pageSize: number;
  /** Anime matching the query, across all pages. */
  readonly total: number;
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
  /** Null until the anime has an identity (imported, or listed on a stored catalog page); always null for manga. Link /anime/<slug> only when `imported` too. */
  readonly slug: string | null;
  /** True when an anime row is linked to this AniList id now (ADR 0018): its slug page costs no import. False for manga. */
  readonly imported: boolean;
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

/**
 * The franchise body as the web trusts it after `isAnimeFranchise` (ADR 0018). `imported` is
 * optional here because an older API omits it and the guard accepts that; the API's
 * `FranchiseEntry` keeps it required so every producer sets it. A missing flag means "not
 * imported", so read it with `=== true`.
 */
export interface FranchiseSeasonView extends Omit<FranchiseSeason, 'imported'> {
  readonly imported?: boolean;
}

export interface FranchiseRelatedGroupView {
  readonly group: FranchiseRelatedGroupName;
  readonly entries: readonly (Omit<FranchiseEntry, 'imported'> & {
    readonly imported?: boolean;
  })[];
  readonly total: number;
}

export interface AnimeFranchiseView {
  readonly state: FranchiseState;
  readonly mainLine: readonly FranchiseSeasonView[];
  readonly related: readonly FranchiseRelatedGroupView[];
}

/**
 * GET /anime/slugs/:slug/resolve (OTA-97): which anime a slug names, from the database only,
 * never a source call, so the web app can redirect before anything renders.
 */
export interface AnimeSlugResolution {
  readonly anilistId: number;
  readonly canonicalSlug: string;
}

// --- Catalog lists (OTA-135, ADR 0016) ---------------------------------------------------

/** The lists GET /anime/lists/:kind serves. */
export const ANIME_LIST_KINDS = [
  'trending',
  'top',
  'upcoming',
  'airing',
  'seasonal',
] as const;
export type AnimeListKind = (typeof ANIME_LIST_KINDS)[number];

/** AniList's genres without Hentai (OTA-177, ADR 0016); the `genre` filter takes exactly these. */
export const ANIME_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;
export type AnimeGenre = (typeof ANIME_GENRES)[number];

/** The first year of anime on AniList: the lowest `year` of the seasonal list. */
export const ANIME_LIST_MIN_YEAR = 1917;

/** The season a `seasonal` list shows. */
export interface AnimeListSeason {
  readonly season: AnimeSeason;
  readonly year: number;
}

export const ANIME_LIST_MAX_LIMIT = 50;
export const ANIME_LIST_DEFAULT_LIMIT = 24;

/** One card of a list: what the card renders, plus where it links. */
export interface AnimeListEntry {
  readonly anilistId: number;
  /** Canonical slug; null when not claimed yet (page stored before slugs were claimed, a list outside the claim scope, or a failed claim): link /anime/anilist/{anilistId}. */
  readonly slug: string | null;
  /** True when an anime row is linked to this AniList id now (ADR 0018): link /anime/<slug> then, else /anime/anilist/{anilistId} with nofollow. */
  readonly imported: boolean;
  readonly titleEnglish: string | null;
  readonly titleRomaji: string | null;
  readonly coverImageUrl: string | null;
  /** Dominant colour of the cover, "#rrggbb". */
  readonly coverColor: string | null;
  readonly format: AnimeFormat | null;
  readonly status: AnimeStatus | null;
  readonly episodes: number | null;
  readonly season: AnimeSeason | null;
  readonly seasonYear: number | null;
  readonly startDate: PartialDate | null;
  readonly genres: readonly string[];
  /** AniList popularity: users who have it in a list. */
  readonly members: number | null;
  /** Keeps its source and scale (ADR 0006); null when unrated. */
  readonly score: {
    readonly source: AnimeDataSource;
    readonly score: number;
    readonly scale: 10 | 100;
  } | null;
}

/** A canonical slug as the API mints it: lowercase words joined by single hyphens. */
export const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The fields a list card reads and links with: what `isAnimeListPage` actually checks. */
export type AnimeListCard = Pick<
  AnimeListEntry,
  'anilistId' | 'slug' | 'titleEnglish' | 'titleRomaji' | 'coverImageUrl'
> & {
  /** Optional: an older API does not send it, and a missing flag means not imported (ADR 0018). */
  readonly imported?: boolean;
};

/** A GET /anime/lists/:kind body as far as a card row trusts it. */
export interface AnimeListCardPage {
  readonly kind: AnimeListKind;
  readonly entries: readonly AnimeListCard[];
  readonly nextCursor: string | null;
}

/** GET /anime/lists/:kind. Only a null nextCursor means the end: a page may hold fewer than the limit. */
export interface AnimeListPage {
  readonly kind: AnimeListKind;
  /** The season shown: set for `seasonal` (the default season echoed back), null for other kinds. */
  readonly season: AnimeListSeason | null;
  readonly entries: readonly AnimeListEntry[];
  readonly nextCursor: string | null;
  /** stale: older than its lifetime (a refresh may be running, or the source is down). */
  readonly freshness: 'fresh' | 'stale';
  /** When the oldest source page behind this answer was fetched. */
  readonly fetchedAt: string;
}
