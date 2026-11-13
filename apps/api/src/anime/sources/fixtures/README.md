# Recorded source responses

Real responses, unedited, used by the mapper tests and the fake sources in the integration tests (no live calls in CI).

| File                                    | Request                                                                                         | Recorded                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anilist-*.json` (not `anilist-walk-*`) | `ANILIST_ANIME_QUERY` (`anilist.query.ts`) by `idMal` (`anilist-not-found`: by `id: 999999999`) | 2026-10-17 from graphql.anilist.co, re-recorded when OTA-97 added staff, favourites, rankings and the cover colour to the query (first recorded 2026-10-15) |
| `jikan-attack-on-titan.json`            | `GET https://api.jikan.moe/v4/anime/16498`                                                      | Wayback Machine capture of 2026-01-01 (`web.archive.org/web/20260101092618id_/...`): api.jikan.moe refused connections on 2026-10-15                        |
| `jikan-frieren.json`                    | `GET https://api.jikan.moe/v4/anime/52991`                                                      | Wayback Machine capture of 2026-03-30 (`web.archive.org/web/20260330030342id_/...`)                                                                         |

## Franchise walks (`anilist-walk-*.json`, OTA-95, ADR 0008)

`ANILIST_RELATIONS_QUERY` as added in OTA-95 PR1 (`anilist.query.ts`; the recorded media, target and edge keys match its fields one for one), with `perPage: 50`, recorded 2026-10-16 from graphql.anilist.co (48 requests in all). Each file is a JSON array with one entry per walk level, `{ variables, response }`: `response` is the unedited answer to `variables`. The walk started at the id below, followed SEQUEL and PREQUEL edges to non-adult anime, one level per request.

| File                                                | Start (AniList id) | Requests / nodes | Why it is here                                                                                                        |
| --------------------------------------------------- | ------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `anilist-walk-attack-on-titan.json`                 | 16498              | 8 / 9            | Final Season parts; its PREQUEL is an OVA (No Regrets); THE FINAL CHAPTERS are two SPECIALs                           |
| `anilist-walk-demon-slayer.json`                    | 101922             | 8 / 9            | A movie (Mugen Train) inside the chain; two unaired sequel movies with no start date                                  |
| `anilist-walk-fate-zero.json`                       | 10087              | 5 / 9            | SEQUEL/PREQUEL edges join Fate/stay night 2006, Unlimited Blade Works and Heaven's Feel, which are alternative routes |
| `anilist-walk-frieren.json`                         | 154587             | 3 / 3            | An unaired TV sequel (3rd Season, 2027, romaji title only)                                                            |
| `anilist-walk-fullmetal-alchemist-2003.json`        | 121                | 2 / 2            | Must stay apart from Brotherhood                                                                                      |
| `anilist-walk-fullmetal-alchemist-brotherhood.json` | 5114               | 1 / 1            | Must stay apart from the 2003 series                                                                                  |
| `anilist-walk-gintama.json`                         | 918                | 10 / 11          | Long chain, "Season 2 Part 2", arcs titled without season numbers, movies and a special                               |
| `anilist-walk-monogatari.json`                      | 5081               | 9 / 14           | Non-linear (nodes with several sequels), no season numbers, an ONA season, an unaired entry with no format            |
| `anilist-walk-one-piece.json`                       | 21                 | 2 / 2            | One TV series whose SEQUEL/PREQUEL edge leads to an unrelated-looking ONA (MONSTERS)                                  |

`anilist-minami-ke.json` has no English title, no cover colour and no all-time rankings. `anilist-frieren.json` credits "Original Story" (Kanehito Yamada) and "Original Character Design" (Tsukasa Abe), both creators (writer and artist), and three "Original Work Assistance" credits that are not; the others have one "Original Creator". The core files are pretty-printed (`JSON.stringify(response, null, 2)`, then Prettier); their content is unedited. `anilist-one-piece.json` is airing (`nextAiringEpisode` set). `anilist-attack-on-titan.json` has the trailer id with a trailing tab.

The PR screenshot job (OTA-163, ADR 0013) replays these files through `scripts/screenshots/fake-sources.mjs`: a new core, walk or Jikan fixture is served automatically, and a changed query needs both fakes updated.

## Catalog lists (`lists/anilist-*.json`, OTA-135, ADR 0016)

**Synthetic, not recorded**: graphql.anilist.co was unreachable from the cloud session that built OTA-135, so these are hand-built from the field shapes of the recorded files (ids 9000xx, cover URLs ending `-synthetic.jpg`). Shape `{ variables, response }` as in the walks. Re-record with `ANILIST_LIST_QUERY` (`anilist.query.ts`) and replace these. `airing` page 1 has an adult entry (must be dropped) and a sparse entry (nulls everywhere); `top-page2` is page 2 of the `top` list. They live in `lists/` because the screenshot replay reads every top-level `anilist-*.json` other than the walks as a core `Media` answer; keep new list fixtures there.

`lists/anilist-seasonal-fall-2026.json` (OTA-177, ADR 0016 addendum) is hand-built the same way: the `seasonal` list for FALL 2026 as one page of three entries (a TV series with genres, one with a score, an ONA with no score and no episode count), with the `season` and `seasonYear` variables the list sends.
