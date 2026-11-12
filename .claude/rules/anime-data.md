---
paths:
  - "apps/api/src/anime/**"
  - "apps/web/src/anime/**"
  - "apps/web/app/anime/**"
  - "apps/web/proxy.ts"
---
# Anime data (ADR 0006, OTA-92; moved from CLAUDE.md)

- `GET /anime/:idSource/:externalId` with `anilist` or `myanimelist`, e.g. `curl localhost:3001/anime/myanimelist/16498`. The first request imports from AniList (a few seconds); Jikan fills in MAL data in the background.
- Resolve a slug without importing anything (fast, database only): `curl localhost:3001/anime/slugs/shingeki-no-kyojin/resolve` -> `{"anilistId":16498,"canonicalSlug":"attack-on-titan"}`, or 404.
- By slug (ADR 0007): `curl localhost:3001/anime/slugs/attack-on-titan`. The canonical slug answers `{"kind":"anime",...}`; an alias, a former slug or another letter case answers `{"kind":"redirect","canonicalSlug":...}` (the web client refuses HTTP redirects, so the redirect is data). `/anime/slugs/:slug` is declared before `/anime/:idSource/:externalId` in the controller: both have two segments, keep that order.
- Franchise (ADR 0008): `curl localhost:3001/anime/slugs/attack-on-titan/franchise`. Stored data only: the first call answers `{"state":"walking",...}` and queues a background walk of the SEQUEL/PREQUEL graph on AniList (one batched request per level); call again for the seasons and Related groups. `partial` means AniList just left an entry out (retried after 1 h, then longer; ADR 0008 item 11). Manual fixes live in `anime_franchise_override` and ship as reviewed data migrations (`INSERT ... ON CONFLICT`, ADR 0008).
- Kill switches `ANIME_SOURCE_ANILIST_ENABLED` / `ANIME_SOURCE_JIKAN_ENABLED` (default true, read at start): false hides that source's data everywhere without deleting it. Base URLs `ANILIST_API_URL` / `JIKAN_API_URL` are optional.
- A new source is a new adapter under `apps/api/src/anime/sources` with its own switch and limiter; never read a source's API outside its adapter. Tests use the recorded responses in `sources/fixtures` and local fake servers, never live calls.
- Catalog lists (ADR 0016, OTA-135): `curl 'localhost:3001/anime/lists/airing?limit=24'` -> `{kind, entries, nextCursor, freshness, fetchedAt}`; pass `nextCursor` back as `cursor`. Only a null `nextCursor` is the end (removed anime shrink a page). Declared before `/anime/:idSource/:externalId` in the controller: keep that order. Stored pages live in `anime_list_page` (TTL by kind in `anime-list.query.ts`: trending 1 h, airing 6 h, top and upcoming 24 h); `freshness: "stale"` means older than that, served while a refresh runs or AniList is down. The list fixtures `sources/fixtures/lists/anilist-*.json` are synthetic until re-recorded.
- Import guard (OTA-173, ADR 0006 update): `ImportLimits` (`import-limits.ts`, in memory, `Clock` injected) caps cold imports with a token bucket (10 tokens, one back per 20 s, taken before any source call, once per id however many concurrent requests). Empty bucket: 429 `ANIME_IMPORT_LIMIT_REACHED`, one warning per minute. An id every source answered "not found" for, or that came back adult, is a 404 with no source call and no token for 1 h; a 503 outage is never remembered. Refreshes, fill-ins and walks take no token. `GET /anime/:idSource/:externalId` is not a view: only `/anime/slugs/:slug` moves `lastViewedAt` (tests keeping an anime alive must use the slug route).
