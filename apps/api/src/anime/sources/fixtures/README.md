# Recorded source responses

Real responses, unedited, used by the mapper tests and the fake sources in the integration tests (no live calls in CI).

| File                         | Request                                                                                         | Recorded                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `anilist-*.json`             | `ANILIST_ANIME_QUERY` (`anilist.query.ts`) by `idMal` (`anilist-not-found`: by `id: 999999999`) | 2026-10-15 from graphql.anilist.co                                                                                                   |
| `jikan-attack-on-titan.json` | `GET https://api.jikan.moe/v4/anime/16498`                                                      | Wayback Machine capture of 2026-01-01 (`web.archive.org/web/20260101092618id_/...`): api.jikan.moe refused connections on 2026-10-15 |
| `jikan-frieren.json`         | `GET https://api.jikan.moe/v4/anime/52991`                                                      | Wayback Machine capture of 2026-03-30 (`web.archive.org/web/20260330030342id_/...`)                                                  |

`anilist-minami-ke.json` has no English title. `anilist-one-piece.json` is airing (`nextAiringEpisode` set). `anilist-attack-on-titan.json` has the trailer id with a trailing tab.
