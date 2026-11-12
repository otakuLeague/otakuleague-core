# OTA-98: search, slice 1 (local trigram search API)

- ADR 0015: trigram (`pg_trgm`, `word_similarity`) over full-text. Migration adds `pg_trgm` and `anime_search_normalize(text)`; no `schema.prisma` change.
- `GET /anime/search?q=&page=&pageSize=` (24/page, max 50) scans local snapshots; hits carry `matchedTitle {kind, text}`. `q`: NUL stripped, ≤ 100 chars after NFKD; punctuation-only returns an empty page without querying; rank query has a 2 s `statement_timeout`.
- Tests: 21-row ranking table in `anime-search.integration.spec.ts`, seed in `src/testing/anime-search.seed.ts`. Cloud runs can't run them (no Prisma engines); SQL checked on local Postgres 16 via psql.
- Before merge, on Railway: `pg_trgm` available, `datctype` not `C`, `SELECT show_trgm('進撃')` non-empty.
- Known bug: a rank timeout (57014) returns 500, not 503.
- Next slices (ADR 0015 end): 2 `anime_search_title` + GIN index (must merge before any web page calls search), 3 did-you-mean + filters/sort, 4 AniList fallback with own budget, 5 header suggestions, 6 `/search` page, 7 unknown-slug flow.
- From the security review: add a search rate limit + concurrency cap to OTA-173.
- OTA-166 got `needs-human`: cloud runs can't read the third-party skill repos.
