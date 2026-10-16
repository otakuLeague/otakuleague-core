/** One query per anime, by AniList id or by MAL id (exactly one variable is set). */
export const ANILIST_ANIME_QUERY = `query AnimeCore($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    id
    idMal
    siteUrl
    isAdult
    title { romaji english native }
    synonyms
    format
    status
    startDate { year month day }
    endDate { year month day }
    season
    seasonYear
    episodes
    duration
    description
    coverImage { extraLarge large }
    bannerImage
    trailer { id site }
    genres
    tags { name rank isGeneralSpoiler isMediaSpoiler }
    studios { edges { isMain node { name } } }
    averageScore
    popularity
    externalLinks { site url type }
    nextAiringEpisode { episode airingAt }
  }
}`;

/**
 * ADR 0008: summaries and relations of up to 50 anime per request (AniList caps `perPage`
 * at 50). `relationType(version: 2)` is pinned: version 2 has SOURCE, COMPILATION and
 * CONTAINS. The walk fixtures are recorded with exactly this query.
 */
export const ANILIST_RELATIONS_QUERY = `query RelationNodes($ids: [Int], $perPage: Int) {
  Page(perPage: $perPage) {
    pageInfo { hasNextPage perPage }
    media(id_in: $ids, type: ANIME) {
      id type isAdult format status startDate { year month day } title { english romaji } coverImage { large }
      relations {
        edges {
          relationType(version: 2)
          node { id type isAdult format status startDate { year month day } title { english romaji } coverImage { large } }
        }
      }
    }
  }
}`;
