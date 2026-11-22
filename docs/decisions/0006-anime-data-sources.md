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

| Feature                                                                                                    | Source (primary, then fallback)                         | Notes                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header: titles, synonyms, format, episodes, duration, status, dates, season, source, studios, genres, tags | AniList                                                 | MAL API only with MAL's written authorization to combine (3(a)(vii))                                                                                                                                                                                                                                                        |
| Header extras (OTA-97): original creators, favourites, all-time ranks (per format), cover colour           | AniList                                                 | AniList only, never filled from MAL: MAL's favourites and rank count a different user base and scope                                                                                                                                                                                                                        |
| At a Glance facts (OTA-215): source material, country of origin, producers, official hashtags              | AniList; Jikan fills source material and producers only | Facts about the work, not about a user base, so the usual fallback applies. Jikan has no country or hashtags. The Jikan-filled values are MAL content: they fall under the same MAL authorization as every other Jikan field (OTA-127), and a refusal is the `ANIME_SOURCE_JIKAN_ENABLED` switch. See the 2026-11-22 update |
| Scores and rank                                                                                            | AniList `averageScore`, `rankings`                      | A "MAL score" next to it needs the same MAL authorization; never averaged                                                                                                                                                                                                                                                   |
| Trailer                                                                                                    | AniList `trailer` (YouTube id)                          | AniList's id came with a trailing tab: trim it. Embed the YouTube player, never re-host                                                                                                                                                                                                                                     |
| Where to watch                                                                                             | AniList `externalLinks`, type `STREAMING`               | No per-country availability; TMDB/JustWatch needs a commercial agreement                                                                                                                                                                                                                                                    |
| Episode list (number, title, air date)                                                                     | **No clean source**                                     | AniList `streamingEpisodes` covers Crunchyroll titles only; Kitsu has it but its terms are unread                                                                                                                                                                                                                           |
| Per-episode scores                                                                                         | **No source** we may use                                | See below                                                                                                                                                                                                                                                                                                                   |
| Characters (role, image, favourites)                                                                       | AniList                                                 |                                                                                                                                                                                                                                                                                                                             |
| Voice actors by language                                                                                   | AniList, one query per language                         | Aliased `voiceActors(language: …)` fields in one query all returned the French actors; one query per language is correct                                                                                                                                                                                                    |
| Character and staff favourites                                                                             | AniList                                                 |                                                                                                                                                                                                                                                                                                                             |
| Staff                                                                                                      | AniList                                                 |                                                                                                                                                                                                                                                                                                                             |
| Openings, endings (titles, artists)                                                                        | AnimeThemes, only with written approval                 | AniList has none                                                                                                                                                                                                                                                                                                            |
| Theme videos                                                                                               | AnimeThemes, only with approval                         | Hotlinking not covered by their terms                                                                                                                                                                                                                                                                                       |
| OSTs (full soundtracks)                                                                                    | **No source**                                           | AnimeThemes excludes full tracks                                                                                                                                                                                                                                                                                            |
| Relations (sequels, prequels...)                                                                           | AniList                                                 |                                                                                                                                                                                                                                                                                                                             |
| Pictures                                                                                                   | AniList cover and banner, hotlinked                     | No gallery; MAL's pictures are "the exclusive property of Company and its licensors"                                                                                                                                                                                                                                        |
| Other videos (PVs, previews)                                                                               | **No source** we may use                                | Jikan has them, scraped from MAL                                                                                                                                                                                                                                                                                            |
| Stats (score and status distribution)                                                                      | AniList `stats`                                         |                                                                                                                                                                                                                                                                                                                             |
| User recommendations                                                                                       | AniList `recommendations` (titles and vote counts only) | Not MAL's                                                                                                                                                                                                                                                                                                                   |
| Airing schedule                                                                                            | AniList `nextAiringEpisode`, `airingSchedule`           | Verified on One Piece and Kusuriya no Hitorigoto 3rd season                                                                                                                                                                                                                                                                 |
| Filler info                                                                                                | **No source**                                           | None of the sources has a filler flag                                                                                                                                                                                                                                                                                       |
| Reviews                                                                                                    | **Never copied**                                        | See "What we must not copy"                                                                                                                                                                                                                                                                                                 |

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

## Update 2026-11-12: guard first-visit imports against id enumeration (OTA-173)

Problem: any GET to `/anime/:idSource/:externalId` imports on first visit, with no limit. A crawler walking ids turns "on demand" into the bulk import that decision 1 and "What we must not copy" forbid. It also uses up the one AniList limiter (30 requests per minute shared by imports, refreshes, franchise walks and page sections), costs a source call on every hit of an id AniList does not have, and keeps what it imported alive by coming back, so the 30-day purge never runs. The API only sees Vercel's addresses: it cannot limit per visitor.

Decision: **imports stay open to any id, behind a global cap.** Importing only ids already stored as relation nodes of a franchise is rejected: the season selector (OTA-172) links to seasons the walk has not stored yet (walk in progress, `partial`), search (OTA-98) will open anime that belong to no stored franchise, and `/anime/myanimelist/:id` has no node table to check.

1. **Cold-import cap**: a token bucket in the importer, 10 tokens, one back every 20 seconds. Every attempt to import an anime we do not have takes one token before any source is called, whether the id exists or not, by id or by the slug of a purged anime. Concurrent requests for one id share one attempt. Sustained, that is 3 AniList requests per minute (10% of today's limit) and at most 4,320 attempts per day. Refreshes, fill-ins and franchise walks take no token, so imports cannot starve them. With no token left the API answers 429 `ANIME_IMPORT_LIMIT_REACHED` (a 4xx: unlike the 503 of a source outage it is not logged as an error per request) and logs one warning per minute at most.
2. **Negative cache**: an id that every source asked answered "not found" (unknown id, manga), or that came back adult, is remembered for 1 hour, per id source and id. A repeat hit gets the same 404 `ANIME_NOT_FOUND` with no source call and no token. An outage (503) is never remembered. Every entry cost a token, so at most 10 + 180 are alive at once: dropping the expired ones on insert is enough, no size limit.
3. **An id lookup is not a view**: only `/anime/slugs/:slug`, the page a person reads, moves `lastViewedAt`. The id route still imports, serves and refreshes, but an anime imported by walking ids and never opened is purged 30 days later (decision 10).
4. **`robots.txt`** gets one rule, `Disallow: /anime/anilist/`: a compliant crawler following season links would otherwise import every season it sees. The `X-Robots-Tag` header on that route stays for the others. Still no `Disallow: /` (OTA-134).

All of it is in memory, per process (one Railway instance, ADR 0009): no table, no migration, no env variable, no dependency. A restart refills the bucket and forgets the not-found ids, which costs at most 10 extra imports and one call per forgotten id.

Also rejected: a database table for the not-found ids and the import count. It would survive restarts and a second instance, at the price of a migration and a write per miss, for state that is worth an hour.

Risks we accept:

- **The cap bounds the rate, not the total.** A patient crawler can still make us import up to 4,320 ids a day, each kept 30 days. The hard bound is the relation-node allowlist: revisit it if the cap warning shows up on several days, or if AniList objects.
- **Too simple on purpose: the bucket does not know who is asking.** While a crawler empties it, a visitor opening a season we do not have, or a purged page, gets the 429 too; cached pages are unaffected. If the warning shows up next to real traffic, the next step is a reserved share for ids we already know (relation nodes, identities) or a firewall rule on Vercel, not a higher cap.
- A second API instance doubles the cap. During an AniList outage cold requests answer 503 until the bucket is empty, then 429: both mean "try later".
- A "not found" that stops being true (a new AniList entry, an adult flag lifted) heals within the hour.
- **Known limits.** The Railway API domain is publicly reachable, so the "API only sees Vercel" premise does not stop direct hits on it (follow-up, separate ticket: a web-to-API shared-secret guard; now [ADR 0019](0019-internal-api-key-and-visitor-import-limit.md), OTA-182: once `INTERNAL_API_KEY` is set, a direct hit without it gets 403). A crawler that follows the id-to-slug redirect still refreshes `lastViewedAt` through the slug page view.
- Background refreshes of stale anime take only a free AniList slot (`maxQueueMs: 0`), so they never queue ahead of a cold import.

## Update 2026-11-13: listed anime claim slugs (OTA-190)

Anime on stored catalog lists get a permanent identity and two title-derived slugs without an import and without a source call. These rows hold no AniList data beyond the id and are never purged; see the slice 3 addendum of [ADR 0016](0016-catalog-lists.md) (claim scope, Terms).

## Update 2026-11-13: deleting list-claimed identities (OTA-192)

`anime_identity.imported_at` null means an anime row never held this AniList id. The runbook in the OTA-192 addendum of [ADR 0016](0016-catalog-lists.md) deletes those identities and their slugs in one transaction, by time window or all of them. Removed identities are kept.

If AniList refuses us keeping even the id and two title-derived slugs:

1. Set `ANIME_SOURCE_ANILIST_ENABLED=false` and restart the API, so nothing claims again.
2. Run the runbook without a window.
3. Run `DELETE FROM "anime_list_page";`, because stored pages hold AniList titles and covers (list slugs are joined from `anime_identity` when served, not stored in the page).

Imported identities, their slugs and snapshots are part of the re-decision the Status line above requires.

## Update 2026-11-22: At a Glance facts (OTA-215)

Four facts the old site showed and we did not store: source material, country of origin, producers, official hashtags. API and shared types only; the web card is a later slice. No new ADR: this follows the OTA-97 precedent (nullable columns on `anime_source_snapshot`, a row in the coverage table).

**Requirements.** Functional: (1) a visitor's anime answer says what the anime adapts, where it was made, who produced it and its official hashtags, each with its source and fetch time; (2) each fact is null when no enabled source has it; (3) an anime only Jikan knows still gets the facts Jikan has. Non-functional: (a) 0 extra source requests: still 1 AniList request per import or refresh, 0 more to Jikan; (b) 0 breaking changes: every mix of old or new web, old or new API and the migration applied works, and an API rollback needs no down migration; (c) the migration is metadata-only (`ADD COLUMN`, nullable or constant default), no table rewrite, on a table the 30-day purge keeps to a few thousand rows; (d) stored anime gain the facts within their existing lifetime after a view: 1 day while airing or announced, 7 days otherwise, with 0 bulk requests; (e) third-party text is bounded: at most 5 hashtags of at most 100 characters. **Availability over consistency**: a stale or missing fact harms nobody, so stored values are served at once and refreshed in the background, like every other field.

**Entities.** `AnimeSourceSnapshot` (4 columns), `AnimeDetails` (4 `Sourced` fields), `AnimeSourceMaterial` (a union).

**API.** No new route. `GET /anime/:idSource/:externalId` and `GET /anime/slugs/:slug` gain four keys, always present, null when unknown:

| Field             | Type                                   | Rule                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceMaterial`  | `Sourced<AnimeSourceMaterial> \| null` | AniList's `MediaSource` version 3 (15 values: `ORIGINAL`, `MANGA`, `LIGHT_NOVEL`, `VISUAL_NOVEL`, `VIDEO_GAME`, `OTHER`, `NOVEL`, `DOUJINSHI`, `ANIME`, `WEB_NOVEL`, `LIVE_ACTION`, `GAME`, `COMIC`, `MULTIMEDIA_PROJECT`, `PICTURE_BOOK`). Not `source`: that word already means the data source in `Sourced` |
| `countryOfOrigin` | `Sourced<string> \| null`              | ISO 3166-1 alpha-2, exactly two upper-case letters, else null. Shape only, not the ISO registry                                                                                                                                                                                                                |
| `producers`       | `Sourced<readonly string[]> \| null`   | Names, in the source's order, each once                                                                                                                                                                                                                                                                        |
| `hashtags`        | `Sourced<readonly string[]> \| null`   | AniList's `hashtag` is one string that can hold several tags (`#フリーレン #frieren`): split at the boundary, each tag starts with `#`                                                                                                                                                                         |

**Data flow.** `ANILIST_ANIME_QUERY` (adds `source(version: 3)`, `countryOfOrigin`, `hashtag`, and `isAnimationStudio` on the studio node) → `mapAniListMedia` → `AnimeSnapshot` → `toSnapshotRow` → `anime_source_snapshot` → `fromSnapshotRow` → `mergeAnime` (`pick`, AniList first) → `AnimeDetails`.

**Design, simplest version.**

1. Columns: `source_material TEXT`, `country_of_origin TEXT`, `producers TEXT[] DEFAULT '{}'`, `hashtags TEXT[] DEFAULT '{}'`, in one new migration shaped like `anime_header_fields`. `source_material` is text, not a Postgres enum: nothing filters on it, the mapper writes only union values and the row reader narrows with `oneOf` (as for `trailer_site`), so a value AniList adds later is a code change, not an `ALTER TYPE`.
2. `studios` keeps its meaning: every company AniList credits, `main` = the edge's `isMain`. It already holds producers as `main: false`, and the web shows only `main`. Removing producers from it would change a field the deployed web reads, so they stay; a producer's name is in both fields.
3. A producer is a credited company whose `isAnimationStudio` is exactly `false`. A missing or non-boolean flag is not a producer: the mapper never guesses. Consequence: a supporting animation studio (Production I.G on Attack on Titan: `isMain` false, animation studio) is in `studios` only, while AniList's own page and MyAnimeList list it under Producers. Accepted: it is not a producer, and nothing is lost (`studios` minus `main` minus `producers`).
4. Hashtags: every match of `#` (or full-width `＃`, stored as `#`) followed by characters that are neither whitespace nor `#`, after zero-width characters are removed; trailing punctuation is trimmed (`#a、#b` is two tags); a word without `#` or a bare `#` is dropped; duplicates once, compared case-insensitively, first spelling kept; over-long tags dropped; the first 5 kept. Producers: names of at most 300 characters, each once, the first 50.
5. Jikan: `producers` from its `producers` list (not `licensors`); `sourceMaterial` from MAL's label only where AniList has the same notion (`Original`, `Manga`, `4-koma manga`, `Web manga`, `Light novel`, `Novel`, `Web novel`, `Visual novel`, `Picture book`, `Mixed media`, `Other`); `Game`, `Card game`, `Book`, `Radio`, `Music`, `Unknown` and anything else are null. `countryOfOrigin` null, `hashtags` empty.
6. Merge: four `pick` lines. An empty list is "no value", so Jikan's producers fill in when AniList credits only animation studios, labelled `jikan`.

**Deep dives (the requirements above only).**

- _Deploy order (b)._ Old web, new API: four extra keys, and the web has no guard on the anime body, so they are ignored. New web, old API, or a body cached by Next.js before the API deploy: the keys are absent, so the web slice must read them with `?.value` (as `headerFacts` does for every field) and test a body without them. Old API, migrated database: Prisma names its columns, new ones are ignored on read and take their default on write.
- _Stored snapshots (d)._ Rows stored before the migration answer null until their next refresh. For up to 7 days null means either "the source has none" or "not fetched since OTA-215". Accepted: nothing shows these facts yet, and the card hides a missing fact (decision 9).
- _One request (a)._ All four ride the existing query. A field or argument AniList does not know fails GraphQL validation for the whole query, so every import and refresh would fail while tests on fixtures stay green. The query must be run once against graphql.anilist.co before merge.

**Rejected.** (1) A backfill job over stored anime: a bulk fetch, against decision 1 and the rate limits, to save at most 7 days on facts no page shows yet. (2) A snapshot schema version that marks old rows stale: a column and a refresh rule for a one-off wait, and without it a truly null hashtag cannot be told from an old row anyway. (3) Deriving producers from `isMain` false with no new column: free for stored rows, but it calls supporting animation studios producers.

**Too simple or too complicated?** Too simple in one place: fixtures cannot prove the query is valid (see _One request_), hence the live check before merge. Not too complicated: the only optional part is Jikan's source-material table (about 12 lines), kept because it is the only source of that fact when AniList is switched off.

**Fixtures.** The session that planned this could not reach graphql.anilist.co. Preferred: re-record the four core files with the new query. Otherwise add `source`, `countryOfOrigin`, `hashtag` and each studio node's `isAnimationStudio` by hand, say so in the fixtures README (these keys are then not recorded), and re-record under a follow-up ticket. Jikan's files already hold `source` and `producers`: unchanged.

**Terms.** The terms read on 2026-10-15 (see above) are about data sources as a whole, with no carve-out for these four fields; the addendum adds no new source or request. The two Jikan-filled fields are MAL content and wait on OTA-127 with the rest. The terms were not re-read on 2026-11-22.
