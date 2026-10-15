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
    reason: string,
  ) {
    super(`${source} unavailable: ${reason}`);
    this.name = 'SourceUnavailableError';
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
