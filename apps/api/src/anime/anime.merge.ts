import type {
  AnimeDataSource,
  AnimeDetails,
  AnimeIdSource,
  AnimeScore,
  Sourced,
} from '@otakuleague/shared-types';
import type { AnimeSnapshot } from './sources/source.types';

/** A snapshot as stored: who said it and when. */
export interface StoredSnapshot {
  readonly source: AnimeDataSource;
  readonly fetchedAt: Date;
  readonly snapshot: Omit<AnimeSnapshot, 'ids' | 'adult'>;
}

export interface StoredAnime {
  readonly id: string;
  readonly lastViewedAt: Date;
  readonly externalIds: readonly {
    readonly source: AnimeIdSource;
    readonly externalId: number;
  }[];
  readonly snapshots: readonly StoredSnapshot[];
}

/** Primary first (ADR 0006): a later source only fills what an earlier one lacks. */
export const SOURCE_PRIORITY: readonly AnimeDataSource[] = ['anilist', 'jikan'];

/** The id namespaces each source reports: AniList gives its id and the MAL id, Jikan the MAL id. */
const REPORTED_IDS: Readonly<
  Record<AnimeDataSource, readonly AnimeIdSource[]>
> = {
  anilist: ['anilist', 'myanimelist'],
  jikan: ['myanimelist'],
};

/**
 * Id namespaces backed by an enabled source that has data for this anime. Ids from a
 * switched-off source are hidden like its values (ADR 0006 update).
 */
export function visibleIdSources(
  anime: StoredAnime,
  isEnabled: (source: AnimeDataSource) => boolean,
): Set<AnimeIdSource> {
  return new Set(
    anime.snapshots
      .filter((stored) => isEnabled(stored.source))
      .flatMap((stored) => REPORTED_IDS[stored.source]),
  );
}

const SCORE_SCALE: Readonly<Record<AnimeDataSource, AnimeScore['scale']>> = {
  anilist: 100,
  jikan: 10,
};

type MergedField = Exclude<
  keyof AnimeDetails,
  'id' | 'externalIds' | 'scores' | 'attributions'
>;

function hasValue(value: unknown): boolean {
  return value !== null && !(Array.isArray(value) && value.length === 0);
}

function pick<T>(
  snapshots: readonly StoredSnapshot[],
  read: (snapshot: StoredSnapshot['snapshot']) => T | null,
): Sourced<T> | null {
  for (const stored of snapshots) {
    const value = read(stored.snapshot);
    if (value !== null && hasValue(value)) {
      return {
        value,
        source: stored.source,
        fetchedAt: stored.fetchedAt.toISOString(),
      };
    }
  }
  return null;
}

/**
 * Builds the page from the snapshots of enabled sources. Per field: the first source in
 * priority order that has a value; never an average, never two sources in one field.
 * Scores are listed per source. A disabled source contributes nothing, not even attribution.
 */
export function mergeAnime(
  anime: StoredAnime,
  isEnabled: (source: AnimeDataSource) => boolean,
  now: Date,
): AnimeDetails {
  const visibleIds = visibleIdSources(anime, isEnabled);
  const snapshots = anime.snapshots
    .filter((stored) => isEnabled(stored.source))
    .toSorted(
      (a, b) =>
        SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source),
    );
  const fields: { [K in MergedField]: AnimeDetails[K] } = {
    titleRomaji: pick(snapshots, (s) => s.titleRomaji),
    titleEnglish: pick(snapshots, (s) => s.titleEnglish),
    titleNative: pick(snapshots, (s) => s.titleNative),
    synonyms: pick(snapshots, (s) => s.synonyms),
    format: pick(snapshots, (s) => s.format),
    status: pick(snapshots, (s) => s.status),
    startDate: pick(snapshots, (s) => s.startDate),
    endDate: pick(snapshots, (s) => s.endDate),
    season: pick(snapshots, (s) => s.season),
    seasonYear: pick(snapshots, (s) => s.seasonYear),
    episodes: pick(snapshots, (s) => s.episodes),
    durationMinutes: pick(snapshots, (s) => s.durationMinutes),
    synopsis: pick(snapshots, (s) => s.synopsis),
    coverImageUrl: pick(snapshots, (s) => s.coverImageUrl),
    bannerImageUrl: pick(snapshots, (s) => s.bannerImageUrl),
    trailer: pick(snapshots, (s) => s.trailer),
    genres: pick(snapshots, (s) => s.genres),
    tags: pick(snapshots, (s) => s.tags),
    studios: pick(snapshots, (s) => s.studios),
    links: pick(snapshots, (s) => s.links),
    // A stale snapshot can hold an episode that has aired since: never show it as next.
    nextEpisode: pick(snapshots, (s) =>
      s.nextEpisode === null ||
      s.nextEpisode.airingAt.getTime() <= now.getTime()
        ? null
        : {
            episode: s.nextEpisode.episode,
            airingAt: s.nextEpisode.airingAt.toISOString(),
          },
    ),
  };
  return {
    id: anime.id,
    externalIds: anime.externalIds
      .filter(({ source }) => visibleIds.has(source))
      .map(({ source, externalId }) => ({ source, id: String(externalId) }))
      .toSorted((a, b) => a.source.localeCompare(b.source)),
    ...fields,
    scores: snapshots.flatMap(({ source, fetchedAt, snapshot }) =>
      snapshot.score === null
        ? []
        : [
            {
              source,
              fetchedAt: fetchedAt.toISOString(),
              score: snapshot.score,
              scale: SCORE_SCALE[source],
              scoredBy: snapshot.scoredBy,
              rank: snapshot.rank,
              members: snapshot.members,
            },
          ],
    ),
    attributions: snapshots.map(({ source, fetchedAt, snapshot }) => ({
      source,
      url: snapshot.sourceUrl,
      fetchedAt: fetchedAt.toISOString(),
    })),
  };
}
