# 0006: Anime data sources, licenses and what the anime page can show

Status: proposed (2026-10-15, OTA-90). To be re-decided once AniList and MyAnimeList answer the permission requests below: a refusal changes the decision itself.

## Context

The anime page wants every possible piece of information: header fields, trailer, where to watch, episodes with ratings, characters and voice actors by language, favourites, staff, openings and endings, relations, pictures, stats, recommendations, airing schedule, filler. None of it is ours: it has to come from third-party sources, whose terms may forbid what we plan. Two plans make that matter: the site may show ads, and YouTubers will use it in their videos. Building on a source we cannot legally use means rewriting the import later.

This is a spike. The deliverable is this decision, not code. The throwaway script that fetched Attack on Titan (MAL id 16498) from each reachable source lives outside the repo; its raw outputs are attached to OTA-90.

## Sources and their terms

All terms pages were read on **2026-10-15**. Quotes are verbatim; anything outside quotation marks is our summary. "Not covered" means we read the page and it says nothing on the point; "unread" means we could not get the page. "Per the docs" means we did not call the API ourselves.

### AniList GraphQL API

- Data, verified on Attack on Titan: titles, format, episodes, duration, dates, season, source, studios, genres, tags, scores, rankings, popularity, favourites, cover and banner, trailer (YouTube id), external links (streaming sites), Crunchyroll episode titles (`streamingEpisodes`), score and status distributions, relations, recommendations with vote counts, characters with favourites, voice actors per language, staff with favourites. Airing schedule verified on two airing shows (One Piece, Kusuriya no Hitorigoto 3rd season). **Not in AniList**: per-episode ratings, a complete episode list, theme songs, OSTs, other videos, a picture gallery beyond cover and banner, filler flags, per-country streaming availability.
- Auth: none for public reads (the spike's queries had no token).
- Rate limit ([rate limiting](https://docs.anilist.co/guide/rate-limiting)): "The AniList API has a rate limit of 90 requests per minute." Today: "The API is currently in a degraded state and is limited to 30 requests per minute." Exceeding it gives "a 1 minute timeout"; "Any further requests in this timeout period will also include the Retry-After and X-RateLimit-Reset headers in the response." "We are not currently accepting requests for increased rate limits."
- Terms ([terms of use](https://docs.anilist.co/guide/terms-of-use)):
  - "Free for non-commercial usage."
  - "Using the AniList API as a backup or data storage service is strictly prohibited."
  - "Hoarding or mass collection of data from the AniList API is strictly prohibited."
  - "Use of the AniList API within competing, non-complementary services of the same nature is prohibited. This includes, but is not limited to, anime and manga list or tracker services. The restriction applies to all data provided through the API, including both user data and media data."
- Commercial use: "The AniList API may be used within commercial applications or services operating at less than $150 of revenue per month free of charge, no express permission is required." and "Applications or services operating at greating than $150 of revenue per month will need to acquire a commercial license. If you would like to use the AniList API in a commercial product, send an email to contact@anilist.co and we can discuss it."
- Attribution: not covered. Naming: "AniList" in our app name would need "UNOFFICIAL" or "for AniList"; not our case.
- Images (`s4.anilist.co`): not covered. The site terms page (anilist.co/terms) only renders a client-side shell: unread.

### MyAnimeList official API v2

- Data, per the [API v2 reference](https://myanimelist.net/apiconfig/references/api/v2) (not called: no Client ID yet): anime details (titles, dates, synopsis, mean score, rank, popularity, members, genres, studios, source, rating, pictures, related, recommendations, statistics), rankings, seasons, user lists. The reference shows **no endpoints for episodes, characters, voice actors, staff, themes or videos**.
- Auth: "When user login is not required, the X-MAL-CLIENT-ID request header can be used to authenticate the client by setting your API client ID." The agreement: "You must obtain a Client ID from the Company through the application and registration process to use and access the API."
- Terms ([API License and Developer Agreement](https://myanimelist.net/static/apiagreement.html), last modified August 8, 2019):
  - Scope, 2(a): the license is "solely for your internal business purposes in developing Your Applications that will communicate and interoperate with aspects of the Company Offering".
  - Ads: non-commercial apps "may include some pay per click or pay per view advertising or other similar advertising" if it "(i) does not disrupt the user experience and (ii) is in compliance with all applicable law and the terms and conditions of this Agreement." Under 4(h), ads must not "(i) target minors", nor contain adult content.
  - Commercial apps (subscriptions, paid tiers, "advertising company applications", "Crowdfunding and soliciting donations via quotas") may not "generate, charge or earn any fees, profits, revenues or other funds or amounts through Your Commercial Applications" without "the express authorization of the Company in writing".
  - 4(b): MAL must be notified upon the release of an app and of "major upgrades", including "previously non-commercial applications becoming commercial applications" and "the addition of ads"; MAL may review them at its option and refuse.
  - 3(a)(vii): we may not "combine or integrate the API with any software, applications, technology, services, or materials not expressly authorized by Company in writing".
  - 3(a)(ix): we may not "use the API in any of Your Applications to imitate or attempt to impersonate the user experience of the Company Offering".
  - 3(a)(xii): we may not "delete, translate, edit, modify or otherwise alter in any way any MyAnimeList Content" without "the Company's express written authorization".
  - 3(c): no server-side storage of "personal information of MyAnimeList users" or "content generated by such users, such as forum posts".
  - 3(e): content must be deleted or changed "in any case within 24 hours after a request to do so by us or by a MyAnimeList end user".
  - 4(i): "You agree that you and Your Applications will not engage in any data scraping, web scraping, web harvesting, or other data extraction methods" and "You agree that you and Your Applications will only obtain MyAnimeList Content directly through the API as intended and authorized by the Company."
  - Attribution: Company Marks only "to attribute MyAnimeList and the Company Offering as the source of MyAnimeList Content", for example "by stating “authorized by MyAnimeList”".
  - Images: not covered by the agreement. The site terms ([terms of use](https://myanimelist.net/about/terms_of_use), last updated December 16, 2025) list "images" in Company Content, "the exclusive property of Company and its licensors".

### Jikan (unofficial MyAnimeList API)

- What it is ([jikan-rest README](https://github.com/jikan-me/jikan-rest)): "It scrapes the website to satisfy the need for API functionality that MyAnimeList.net lacks." Disclaimer: "You are responsible for the usage of this API. Please be respectful towards MyAnimeList's Terms Of Service".
- Data, per its docs: everything MAL's website shows, including episodes with per-episode scores, characters, staff, theme song titles, videos and pictures.
- Rate limit (OpenAPI description in the same repo): 3 requests per second, 60 per minute, daily unlimited; "All requests are cached for **24 hours**." No auth.
- Commercial use, attribution, images: Jikan's own terms page (jikan.moe/terms, linked from its docs) returned 404: unread. The content is MAL's, so MAL's terms apply, and MAL's agreement 4(i) forbids "data scraping, web scraping, web harvesting, or other data extraction methods". MAL's site terms add: "you agree not to collate or aggregate any of the content available through the Service for use elsewhere."
- Availability: `api.jikan.moe` refused connections (connect timeouts) for the whole spike, retried every 2 minutes from 14:53 UTC, while jikan.moe and myanimelist.net answered.

### AnimeThemes.moe

- Data, verified: openings and endings per anime (sequence, song title, artists, WebM video links), with mappings to MAL and AniList. Attack on Titan S1 returned OP1, OP2, ED1, ED2 with `https://v.animethemes.moe/...webm` links.
- Rate limit ([docs repo](https://github.com/AnimeThemes/animethemes-api-docs), `docs/jsonapi/intro/ratelimiting`): "The AnimeThemes API limits requests to 90 per minute." Auth: only for protected (write) actions.
- Terms ([terms of service](https://animethemes.moe/about/terms-of-service), [FAQ](https://animethemes.moe/about/faq)):
  - "The Site may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us."
  - Prohibited: "Use the Site as part of any effort to compete with us or otherwise use the Site and/or the Content for any revenue-generating endeavor or commercial enterprise."
  - "You cannot use AnimeThemes.moe for a competitive or commercial service without approval from the moderation team." and "The moderation team reserves the right to deny or rescind permission for your project at any time."
- Hotlinking the WebMs, attribution, and who owns the clips: not covered. Assumption: the clips are cut from the anime (they exclude anything "not sourced directly from its anime"), so the rights sit with the anime's rights holders and, for the music, with labels and artists.

### Kitsu

- Data, verified: anime details, average rating with its frequency distribution, episodes (number, titles, air date, synopsis, thumbnail; **no rating field** on any of Attack on Titan's 25 episodes), YouTube trailer id, and mappings to other sites (`/mappings`). JSON:API: a plain `Accept: application/json` gets 406, `application/vnd.api+json` works. No auth for reads.
- Terms: kitsu.app/terms returned 403 to us, also with curl; the API docs render client-side. **Unread**: rate limit, commercial use, attribution, images.

### TMDB

- Data, per the docs (not called: no API key in this project): trailers, where to watch (JustWatch), and per-episode `vote_average` and `vote_count` on season details.
- Auth: an API key or read access token is required. Rate limit ([rate limiting](https://developer.themoviedb.org/docs/rate-limiting)): "They sit somewhere in the 40 requests per second range."
- Terms ([API terms of use](https://www.themoviedb.org/api-terms-of-use), updated October 20, 2023): "The license in Paragraph 1.A above does not permit any commercial use of TMDB, the TMDB APIs, or TMDB Content." Its examples of commercial use include use on or in connection with a "destination" website, and driving traffic or generating revenue for a website "(including from advertising displayed on or by the website, search engine, Chatbot)"; commercial use "is only permitted under a separate written agreement between You and TMDB", and "Any such agreement may be subject to, among other things, payment of fees." No caching "for longer than 6 months". Attribution: "You must use the TMDB logo to identify Your use of TMDB, the TMDB APIs, or TMDB Content," plus a notice that the app is not endorsed by TMDB.
- Where to watch ([watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers)): "In order to use this data you must attribute the source of the data as **JustWatch**."

### anime-offline-database (manami-project)

- A JSON dataset of 41,537 anime (release 2026-27, 2026-07-04; the one before was 2026-14) with titles, type, episodes, status, season, studios, tags, picture URLs, a combined score, and the URLs of the same anime on MAL, AniList, Kitsu, AniDB and others ([repo](https://github.com/manami-project/anime-offline-database)).
- License: ODbL-1.0 per its README badge (GitHub's detection says NOASSERTION). ODbL requires attribution, and share-alike if we publicly use a database derived from it, for example if our API ever exposes the id table built from it.
- It is compiled from the sites above, so its license does not clear their rights; we use it only for the id cross references.

## Coverage of the anime page

| Feature | Source (primary, then fallback) | Notes |
|---|---|---|
| Header: titles, synonyms, format, episodes, duration, status, dates, season, source, studios, genres, tags | AniList | MAL API only with MAL's written authorization to combine (3(a)(vii)) |
| Scores and rank | AniList `averageScore`, `rankings` | A "MAL score" next to it needs the same MAL authorization; never averaged |
| Trailer | AniList `trailer` (YouTube id) | AniList's id came with a trailing tab: trim it. Embed the YouTube player, never re-host |
| Where to watch | AniList `externalLinks`, type `STREAMING` | No per-country availability; TMDB/JustWatch needs a commercial agreement |
| Episode list (number, title, air date) | **No clean source** | AniList `streamingEpisodes` covers Crunchyroll titles only; Kitsu has it but its terms are unread |
| Per-episode scores | **No source** we may use | See below |
| Characters (role, image, favourites) | AniList | |
| Voice actors by language | AniList, one query per language | Aliased `voiceActors(language: …)` fields in one query all returned the French actors; one query per language is correct |
| Character and staff favourites | AniList | |
| Staff | AniList | |
| Openings, endings (titles, artists) | AnimeThemes, only with written approval | AniList has none |
| Theme videos | AnimeThemes, only with approval | Hotlinking not covered by their terms |
| OSTs (full soundtracks) | **No source** | AnimeThemes excludes full tracks |
| Relations (sequels, prequels...) | AniList | |
| Pictures | AniList cover and banner, hotlinked | No gallery; MAL's pictures are "the exclusive property of Company and its licensors" |
| Other videos (PVs, previews) | **No source** we may use | Jikan has them, scraped from MAL |
| Stats (score and status distribution) | AniList `stats` | |
| User recommendations | AniList `recommendations` (titles and vote counts only) | Not MAL's |
| Airing schedule | AniList `nextAiringEpisode`, `airingSchedule` | Verified on One Piece and Kusuriya no Hitorigoto 3rd season |
| Filler info | **No source** | None of the sources has a filler flag |
| Reviews | **Never copied** | See "What we must not copy" |

## Episode ratings

- AniList: no per-episode score in the schema; `streamingEpisodes` has title, URL and site only.
- MAL API v2: no episodes endpoint, per its reference.
- MyAnimeList's website shows per-episode scores, which Jikan exposes as `score` on `/anime/{id}/episodes`. Getting them means scraping MAL, which its agreement forbids. Jikan was also unreachable for the whole spike, so their sparsity is **not measured** (planned sample: Attack on Titan S1, Frieren, One Piece, Angel Beats! for 2010, Kaiba as the niche show).
- Kitsu: no rating field on episodes (all 25 Attack on Titan episodes checked).
- TMDB: per-episode `vote_average` and `vote_count` exist per its docs, behind a commercial agreement for a site like ours. TMDB also splits anime into its own seasons, so mapping its episodes to ours would be extra work.

Plan: launch with **no per-episode ratings** and build our own episode ratings in Phase 2, as the ticket expects. Show the AniList series score meanwhile.

## Decision

1. **AniList is the primary source for every field it has**, fetched on demand per anime and cached, never bulk-imported, once AniList confirms in writing that OtakuLeague may use it. Until then, no import code.
2. **MyAnimeList is not a plan B by default.** Using its API alongside AniList needs its written authorization (combining, 3(a)(vii); altering or translating, 3(a)(xii)), and a tracker with anime pages may be read as imitating its experience (3(a)(ix)). We ask through MAL's Customer Support Form at the same time as AniList.
3. **Jikan is not used in production**: it hands us MAL content obtained by scraping, which MAL's agreement forbids, and it was down during the spike.
4. **AnimeThemes only with the moderation team's written approval**; until then, no themes on the page.
5. **TMDB is not used** without its commercial agreement: a public website like ours is commercial under its examples, ads or not.
6. **Kitsu is not used** until its terms are read (kitsu.app/terms in a browser).
7. **Merge rule**: one primary source per field, per the table. A fallback fills a field only when the primary has no value, and only from a source whose terms allow combining. Values from two sources are never averaged or mixed in one field. Scores keep their source label. Every stored value records its source and fetch time.
8. **ID mapping**: our own `anime` id, plus one row per external id (`source`, `external_id`, unique per source). AniList's `idMal` gives AniList ↔ MAL directly; anime-offline-database fills the rest (Kitsu, AniDB) and the cases where `idMal` is null. A conflict (one AniList id pointing at two MAL ids, or the reverse) is flagged for manual review, never guessed.
9. **An anime present in one source only** gets a page built from what that source allows; sections without a source are hidden, not shown empty. An anime with no AniList entry and no id match gets no page until it can be matched.
10. **Cache**: a cached anime expires 7 days after its last fetch and is deleted if nobody opened it in 30 days, so the cache never grows into the "backup or data storage service" AniList forbids. Airing shows refresh daily. The same delete path serves takedown requests within 24 hours.
11. **Images are hotlinked** from the source CDN with attribution, never re-hosted. None of the terms grants rights on images.

## What we must not copy

- Reviews and any long user-written text from AniList, MAL, Kitsu or others. They are users' content; MAL's agreement forbids storing "content generated by such users" server-side, and AniList's terms grant nothing on it. Our own reviews come from our users.
- MAL's recommendation texts and forum posts, for the same reason.
- A bulk copy of AniList: "Hoarding or mass collection of data" and use "as a backup or data storage service" are forbidden. We cache what visitors open, with the expiry above.
- Images and theme videos as files: link, do not re-host.

## Consequences (risks we accept)

- **AniList may refuse us.** Its terms forbid use "within competing, non-complementary services of the same nature", naming "anime and manga list or tracker services", for "all data provided through the API, including both user data and media data". OtakuLeague's watchlists make it a tracker. Before Phase 1 builds anything on AniList, email contact@anilist.co describing the site (watchlists, games, quizzes, ads, the $150 per month threshold, hotlinking `s4.anilist.co` images) and ask for written permission.
- **No clean plan B.** If AniList refuses and MAL does not authorize combining, the only data left is what MAL's API alone gives, used without mixing: no characters, staff, episodes or themes. The page would shrink to header, scores, relations, stats and recommendations, and the watchlist would need its own scope review.
- **Revenue thresholds.** Above $150 of revenue per month, AniList needs a commercial license. MAL counts ads as non-commercial only if they do not disrupt the experience and do not target minors, may refuse the addition of ads after notice, and needs written authorization for anything like subscriptions or donation goals. Assumption, not covered by any of the terms: YouTubers showing the site in their own videos is not our revenue.
- **No complete episode list and no per-episode ratings at launch.**
- **Rate limit on cold pages.** A cold page costs one main AniList query, one per voice-actor language (two: Japanese and English), and one more per page of characters or staff beyond the first. That is 3 to 6 requests, so at today's 30 requests per minute about 5 to 10 cold pages per minute for the whole site. A cold page renders what is cached, shows the missing sections as loading, and fills them when the import catches up; a source down or rate-limited leaves the last cached version or hides the section, never failing the page.
- **Images**: hotlinking keeps us off storage, not off copyright. Some images are user uploads whose rights are unknown. Revisit with legal advice before monetization.
- **Terms change.** AniList's degraded mode, MAL's right to start charging, and AnimeThemes' right to "rescind permission" can each remove a section. The source column in the table is the list to re-check when that happens.

## Learnings

- The fetch tools of an AI assistant hit bot walls (AniList 403) and client-side-rendered docs (Jikan, Kitsu, AnimeThemes); the docs' source repos on GitHub and a plain `curl` were the way to read the actual text.
- GraphQL aliases on AniList's `voiceActors(language:)` silently returned the same data for every language: test each argument separately.
- A review of the first draft found the MAL fallback unsafe (clauses 3(a)(vii), (ix), (xii) were missing) and claims marked "verified" that were not: write "per the docs" unless the call was made.

## Update 2026-10-15: use every useful source now, keep it reversible (OTA-92)

Decision by the owner: use every useful source now and handle the legal side later (OTA-127, written permission from AniList, MyAnimeList and AnimeThemes). AniList stays the primary source; Jikan fills core gaps (MAL score, rank, members, and any core field AniList lacks). Episodes (OTA-101), music (OTA-107) and media (OTA-110) add their own sources in their tickets. This supersedes decisions 1 to 3 above for now; the legal analysis above stands and is what OTA-127 resolves.

Reversibility rules, so that a refusal from any source costs a config change, not a rewrite:

- **One adapter per source** behind a common interface (`AnimeSourceAdapter` in `apps/api/src/anime/sources`). Nothing outside an adapter knows a source's API.
- **One kill switch per source**: `ANIME_SOURCE_<NAME>_ENABLED`, default on. Off means the source is never called and everything it ever stored is hidden from every response (fields, scores, attribution), with no code change and no data deleted, so switching it back on restores it. Read at startup: changing it means a restart, not a deploy.
- **Every stored value keeps its source and fetch time**: one row per anime and source (`anime_source_snapshot`), merged at read time. The model, service and endpoint never know where a value came from except through that stored label.
- **Merge rule unchanged** (decision 7): one primary per field, a fallback only fills an empty field, never an average; scores are listed per source.
- **Cache rules unchanged** (decision 10), with on-demand import and per-source rate limiting (AniList 30 per minute today, Jikan 3 per second and 60 per minute), honoring `Retry-After`.
- **Jikan is optional at runtime**: the core page imports and renders from AniList alone; Jikan fills in when it answers. It was down for the whole OTA-90 spike.

**Adult content**: entries flagged adult (AniList `isAdult`, MyAnimeList rating "Rx - Hentai") are neither imported nor shown for now; the API answers 404 (`ANIME_NOT_FOUND`) as for an unknown id. An anime that any source flags adult on a later refresh is deleted with all its data. Revisit with an explicit age gate if we ever want them.

**Purge and user data**: the 30-day purge deletes an anime with its ids and snapshots (cascade). Before any user table (watchlist entries, quiz attempts) references `anime`, its foreign key must use `Restrict`, and the purge must skip anime that user data references. Otherwise the purge would delete users' rows, or fail as a whole.
