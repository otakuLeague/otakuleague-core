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
