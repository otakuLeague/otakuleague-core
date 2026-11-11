# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W2 designs merged. Done: OTA-97, OTA-134, OTA-163 (real-page screenshots on every web PR). API and Postgres live on Railway. OTA-152 slice 1 merged; OTA-100 Overview tab is in progress.

## Last session
Autopilot on OTA-100 slice 1 (branch `feat/OTA-100-overview-tab`). The Overview tab now renders:
- Synopsis: plain text from the API. A "(Source: X)" line is pulled into a note via a ReDoS-safe regex on the last 200 chars. Collapses to the first paragraph. 5-line clamp with fade only when the first paragraph is over 350 chars; the noscript style shows all.
- Details card: Format, Episodes (incl. "N so far × M min"), Aired (or "Premieres" when upcoming), Season, Studio(s).
- Genre chips: plain text, deduped, max 20.

Pure view model `overviewFacts()` in `apps/web/src/anime/overview-facts.ts`. `OverviewLoader` in `app/anime/[slug]/overview.tsx` reuses the request-cached `loadAnime` (no extra API call). Client island: `synopsis.tsx`. Caps: synopsis 20,000 chars, studios 10.
Decision: only an AniList synopsis is shown. A Jikan/MAL synopsis shows the empty box until OTA-127 clears MAL terms (ADR 0006).

## In progress
- OTA-100 slice 1 PR: open, waiting for Farouk. 934 lines, over the 400-line guideline, so no automerge.
- OTA-172 PR #57: open. OTA-171 PR #56: Farouk's.

## Next 3 tasks
1. OTA-100 slice 2: tags + site-wide spoiler toggle (cookie `ol-spoilers`, read with `cookies()` inside the tab's Suspense, modelled on `src/shell/theme.ts`).
2. OTA-100 slices 3–5: trailer click-to-load (youtube-nocookie, validate id `^[A-Za-z0-9_-]{11}$`) + where to watch (links kind 'streaming'); next-episode card (reuse Countdown or drop); tab previews (score, related via `loadFranchise`). Later API slice for source material + age rating (migration + ADR).
3. OTA-153 Home design once OTA-171 merges. Also OTA-174 (new: cap source text size in the API, quadratic tag-strip regex) and OTA-173.

## Blockers
- OTA-168 (needs-human): Postgres volume backups, deploy drills, Postgres 18 vs 16.
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked, so the normal web build fails here; `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. API checks rely on CI. The proxy also blocks `*.up.railway.app` and `beta.otakuleague.com`.

## Known bugs
- `Cover` has no fallback when an image fails to load (visible in CI screenshots, where CDN images are blocked). No ticket yet.

## Notes
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 (TypeScript 7 / ESLint 10) stays red until typescript-eslint and Next's ESLint plugins support them; never auto-merged.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use teal. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
