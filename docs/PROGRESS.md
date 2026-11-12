# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Done: OTA-152 shell, OTA-97 anime page shell. In review: OTA-100 Overview tab slice 1 (PR #58), OTA-172 season id route (PR #57), OTA-153 Home design (this PR). OTA-171 design-direction docs PR #56 waits for Farouk.

## Last session
Autopilot on OTA-153 (branch `design/OTA-153-home-page`). Home mockups in `docs/design/home/` (Main, Mobile, Light, SignedIn, Poster, Loading, Error) with `motion.md` and `README.md`; Pierce logo SVGs in `apps/web/public/brand/` (full, light-ground, small mark). Hero = "Calm night" with radial-gradient glows (no `filter: blur`) and an opacity sheen instead of a rotating gradient; motion paused until a client island allows it. LCP = hero `h1`, static. Shared row scroller in `docs/design/browse/browse.css` now bleeds to the edge with a gutter-capped fade, desktop ‹ › buttons and one-line card meta. Row and XP slots keep one height across loaded/loading/error/empty (no CLS).

## In progress
- OTA-152 remaining slices: 2b member state, mobile sheet + search (Base UI, `package.json` → Farouk merges), hide shell on `/auth*` and `/onboarding`, 404/500 restyle, social icons.
- OTA-100: later slices after #58.

## Next 3 tasks
1. OTA-136 Build: Home page (unblocked once this PR merges): Logo component (unique gradient ids), motion island, `--ease-drift` into tokens.css, hide `.sh-bg` on home, browse row changes.
2. OTA-98 Build: search, or OTA-152 slice 2b.
3. OTA-166 vendored design skills (protected path, Farouk merges).

## Blockers
- OTA-168 (needs-human): Postgres volume backups, deploy drills.
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked; `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs (installed under `/opt/node-tools/node_modules`, ESM ignores `NODE_PATH`): run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.

## Known bugs
- `Cover` has no fallback when an image fails to load. No ticket yet.

## Notes
- Open questions on OTA-153: Pierce mark site-wide in the header now? Leaderboard per season or all-time? "Trending" sort or reuse Top airing?
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 stays red until typescript-eslint and Next's ESLint plugins support TS 7 / ESLint 10.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
