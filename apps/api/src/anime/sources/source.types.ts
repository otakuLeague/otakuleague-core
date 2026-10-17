import type {
  AnimeDataSource,
  AnimeFormat,
  AnimeIdSource,
  AnimeLink,
  AnimeSeason,
  AnimeStatus,
  AnimeStudio,
  AnimeTag,
  AnimeTrailer,
  PartialDate,
} from '@otakuleague/shared-types';

/** An anime as one source describes it, in our model. Null or empty: the source has no value. */
export interface AnimeSnapshot {
  /** Ids this source knows for the anime, its own first (AniList also gives the MAL id). */
  readonly ids: readonly AnimeRef[];
  /** The source's page for this anime, for attribution. */
  readonly sourceUrl: string;
  /** Adult (hentai) entries are never stored or shown (ADR 0006 update). */
  readonly adult: boolean;
  readonly titleRomaji: string | null;
  readonly titleEnglish: string | null;
  readonly titleNative: string | null;
  readonly synonyms: readonly string[];
  readonly format: AnimeFormat | null;
  readonly status: AnimeStatus | null;
  readonly startDate: PartialDate | null;
  readonly endDate: PartialDate | null;
  readonly season: AnimeSeason | null;
  readonly seasonYear: number | null;
  readonly episodes: number | null;
  readonly durationMinutes: number | null;
  readonly synopsis: string | null;
  readonly coverImageUrl: string | null;
  readonly bannerImageUrl: string | null;
  readonly trailer: AnimeTrailer | null;
  readonly genres: readonly string[];
  readonly tags: readonly AnimeTag[];
  readonly studios: readonly AnimeStudio[];
  readonly links: readonly AnimeLink[];
  readonly score: number | null;
  readonly scoredBy: number | null;
  readonly rank: number | null;
  readonly members: number | null;
  readonly nextEpisode: {
    readonly episode: number;
    readonly airingAt: Date;
  } | null;
  /** Original creators, in the source's order (see the AniList mapper for the roles). */
  readonly creators: readonly string[];
  readonly favourites: number | null;
  /** All-time rank among anime of the same format, by score and by popularity. */
  readonly rankRated: number | null;
  readonly rankPopular: number | null;
  /** Dominant colour of the cover, "#rrggbb". */
  readonly coverColor: string | null;
}

/** AniList MediaRelation, relationType version 2 (ADR 0008). */
export const MEDIA_RELATIONS = [
  'ADAPTATION',
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'CHARACTER',
  'SUMMARY',
  'ALTERNATIVE',
  'SPIN_OFF',
  'OTHER',
  'SOURCE',
  'COMPILATION',
  'CONTAINS',
] as const;
export type MediaRelation = (typeof MEDIA_RELATIONS)[number];

/** Formats only manga have: a source-material target of a relation. */
export const MANGA_FORMATS = ['MANGA', 'NOVEL', 'ONE_SHOT'] as const;
export type MangaFormat = (typeof MANGA_FORMATS)[number];

interface MediaSummaryFields {
  readonly anilistId: number;
  /** AniList has one MediaStatus enum for anime and manga. */
  readonly status: AnimeStatus | null;
  readonly startDate: PartialDate | null;
  readonly titleEnglish: string | null;
  readonly titleRomaji: string | null;
  readonly coverImageUrl: string | null;
}

interface AnimeKind {
  readonly mediaType: 'ANIME';
  readonly format: AnimeFormat | null;
}

/** The few fields the franchise views need about one AniList entry (ADR 0008). */
export type MediaSummary = MediaSummaryFields &
  (
    | AnimeKind
    | { readonly mediaType: 'MANGA'; readonly format: MangaFormat | null }
  );

export interface RelationEdge {
  readonly relation: MediaRelation;
  readonly target: MediaSummary;
}

/** One walked anime: its summary and its relations. Adult entries are already dropped. */
export interface RelationNode extends MediaSummaryFields, AnimeKind {
  readonly edges: readonly RelationEdge[];
}

export interface AnimeRef {
  readonly source: AnimeIdSource;
  readonly externalId: number;
}

export type SourceResult =
  | { readonly kind: 'found'; readonly snapshot: AnimeSnapshot }
  | { readonly kind: 'not_found' };

/** The source is down, too slow, rate-limited past our patience, or answered something unusable. */
export class SourceUnavailableError extends Error {
  constructor(
    readonly source: AnimeDataSource,
    readonly reason: string,
  ) {
    super(`${source} unavailable: ${reason}`);
    this.name = 'SourceUnavailableError';
  }
}

/** The source answered, but nothing usable (e.g. no isAdult): worth a backoff, not a retry. */
export class UnusableAnswerError extends SourceUnavailableError {
  constructor(source: AnimeDataSource, reason: string) {
    super(source, reason);
    this.name = 'UnusableAnswerError';
  }
}

/** One data source behind the common interface (ADR 0006 update). */
export abstract class AnimeSourceAdapter {
  abstract readonly source: AnimeDataSource;
  /** The namespace of this source's own ids: an anime is matched to its stored row by this id. */
  abstract readonly idSource: AnimeIdSource;
  /** Id namespaces this source can look an anime up by (its own first). */
  abstract readonly lookups: readonly AnimeIdSource[];
  /** True during a cool-down after a failure: background work skips the source. */
  abstract isDown(): boolean;
  /** Throws SourceUnavailableError; never returns adult entries as anything but `adult: true`. */
  abstract fetchAnime(ref: AnimeRef): Promise<SourceResult>;
}
