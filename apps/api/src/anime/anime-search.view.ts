import type { AnimeSearchHit } from '@otakuleague/shared-types';
import type { MergedAnime } from './anime.merge';
import type { AnimeRankMatch } from './anime-search.query';

/**
 * One search hit from the merged anime (ADR 0016). Null when no source we show names an id
 * for it, which cannot be linked to.
 */
export function toSearchHit(
  anime: MergedAnime,
  slug: string | null,
  matched: Pick<AnimeRankMatch, 'kind' | 'title'>,
): AnimeSearchHit | null {
  const ref =
    anime.externalIds.find(({ source }) => source === 'anilist') ??
    anime.externalIds[0];
  if (!ref) return null;
  const score = anime.scores[0];
  return {
    slug,
    ref: { source: ref.source, id: ref.id },
    title:
      anime.titleEnglish?.value ??
      anime.titleRomaji?.value ??
      anime.titleNative?.value ??
      matched.title,
    matchedTitle: { kind: matched.kind, text: matched.title },
    format: anime.format?.value ?? null,
    episodes: anime.episodes?.value ?? null,
    season: anime.season?.value ?? null,
    seasonYear: anime.seasonYear?.value ?? null,
    startYear: anime.startDate?.value.year ?? null,
    coverImageUrl: anime.coverImageUrl?.value ?? null,
    coverColor: anime.coverColor?.value ?? null,
    score: score
      ? { source: score.source, score: score.score, scale: score.scale }
      : null,
  };
}
