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
    coverImage { extraLarge large color }
    bannerImage
    trailer { id site }
    genres
    tags { name rank isGeneralSpoiler isMediaSpoiler }
    studios { edges { isMain node { name } } }
    averageScore
    popularity
    favourites
    rankings { rank type allTime format }
    staff(sort: [RELEVANCE, ROLE], perPage: 10) { edges { role node { name { full } } } }
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

/**
 * ADR 0016: one block of up to 50 cards of a catalog list. `isAdult: false` is asked of
 * AniList and checked again by the mapper. Fields are exactly what a list card renders.
 */
export const ANILIST_LIST_QUERY = `query ListPage($page: Int, $sort: [MediaSort], $status: MediaStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, sort: $sort, status: $status) {
      id isAdult title { romaji english } coverImage { large color }
      format status episodes season seasonYear startDate { year month day }
      genres popularity averageScore
    }
  }
}`;
