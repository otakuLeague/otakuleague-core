# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Done: OTA-152 shell, OTA-97 anime page shell, OTA-172 season id route, OTA-153 Home design, OTA-100 Overview slice 1, OTA-171 design direction. In review: OTA-98 search slice 1.

## Last session
Autopilot on OTA-98 (branch `feat/OTA-98-search`), slice 1: ADR 0015 (trigram via `pg_trgm` + `word_similarity`, not full-text), migration adding `pg_trgm` and `anime_search_normalize(text)`, `GET /anime/search?q=&page=&pageSize=` (24/page, max 50) over local snapshots, hits carry the matched title (`matchedTitle.kind/text`). Hardened after review: NUL stripped, `q` capped at 100 chars after NFKD, punctuation-only queries short-circuit, rank query runs with a 2 s `statement_timeout`. 21-row ranking table in `anime-search.integration.spec.ts` (seed in `src/testing/anime-search.seed.ts`). Migration = protected path, so Farouk merges.
OTA-166 got `needs-human`: cloud runs can't read the third-party skill repos.

## In progress
- OTA-98 next slices (ADR 0015 end): 2 `anime_search_title` table + GIN index (must merge before any web page calls search; the scan is ~1–3 s at 20k anime), 3 did-you-mean + filters/sort, 4 AniList fallback with own budget, 5 header suggestions, 6 `/search` page (needs OTA-154 browse template built), 7 unknown-slug flow.
- OTA-152 remaining slices: 2b member state, mobile sheet + search, hide shell on `/auth*` and `/onboarding`, 404/500 restyle, social icons.
- OTA-100 next slices: tags + spoiler toggle, trailer + where to watch, next-episode card, tab previews.

## Next 3 tasks
1. OTA-136 Build: Home page (High, W3) or OTA-98 slice 2 once slice 1 merges.
2. OTA-173 (W7): add search rate limit + concurrency cap to its scope (from the OTA-98 security review).
3. OTA-152 slice 2b.

## Blockers
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked (no `prisma generate`, so API integration tests run only in CI); a local Postgres 16 (`pg_ctlcluster 16 main start`) works for checking SQL via psql. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs: run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.

## Known bugs
- `Cover` has no fallback when an image fails to load. No ticket yet.
- Search: a rank query timeout (57014) returns 500, not 503 (ADR 0015).

## Notes
- Before merging OTA-98 slice 1, on Railway: `SELECT name FROM pg_available_extensions WHERE name='pg_trgm'`, `SELECT datctype FROM pg_database WHERE datname=current_database()`, `SELECT show_trgm('進撃')` non-empty (a `C` locale breaks Japanese and non-ASCII lowercasing).
- OTA-172: seasons without a slug use `app/anime/anilist/[id]/[[...tab]]` (HTTP 200 + meta refresh, see `.claude/rules/web.md`). OTA-174 caps source text size.
- Open questions on OTA-153: Pierce mark site-wide in the header? Leaderboard per season or all-time? "Trending" sort or reuse Top airing?
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 stays red until typescript-eslint and Next's ESLint plugins support TS 7 / ESLint 10.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment; squash merges may add a Co-authored-by trailer. Farouk to decide.
- Design direction (ADR 0012 addendum): bolder identity and motion welcome; PARITY.md covers features only; ADR 0011 performance rules apply.
- OTA-99: regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
