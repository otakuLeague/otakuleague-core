# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Merged on main: OTA-98 slice 1 (#62, local trigram search), OTA-135 slice 1 (#63, catalog lists), OTA-173 (#70, first-visit import guard), OTA-174 (#71, source body caps), designs OTA-155/156/157/158 (#64, #66, #67, #68), OTA-138 ADR 0015 auth (#65). OTA-98 and OTA-135 are Done in Linear. Remaining catalog work: OTA-177 (slices 2–3: seasonal + genre lists, slug claiming).

## Last session
OTA-183 (open, this PR): deploy-order guard. `scripts/deploy-order.mjs` warns when a PR changes `apps/api/` and `apps/web/` plus `packages/shared-types/` or an API controller; CI job `Deploy order` (warning only). Rule: API changes additive first (expand → migrate web → contract), in charter §7 and `.claude/rules/api.md`. Heuristic: it also fires on additive vertical slices. The guard cannot fire on its own PR.

## In progress
- Open: #69 OTA-147 legal/info pages slice 1, draft; waiting on Farouk to confirm legal copy. Its note lives on its own branch.
- Open: OTA-183 deploy-order guard (protected paths `.github`, `scripts`, `.claude/skills`; Farouk merges).

## Next 3 tasks
1. OTA-166 vendor design skills (protected path, Farouk merges).
2. OTA-177 catalog list slices 2–3: seasonal + genre lists, then slug claiming.
3. OTA-136 Build Home page, after the OTA-177 seasonal list. Logo component (unique gradient ids), motion island, `--ease-drift` into tokens.css, hide `.sh-bg` on home, browse row changes.

## Blockers
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Cloud runs have no Prisma engines, so API typecheck and integration specs run in CI only.
- Google Fonts are blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs (ESM ignores `NODE_PATH`): run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.
- Launch date: docs/ROADMAP.md (2026-11-30) and CLAUDE.md (2026-12-28) disagree. Farouk to settle.
- ADR 0015 auth needs Brevo account and DNS (Farouk) before OTA-139 email flows.

## Known bugs
- Two ADRs share number 0016 (anime-search, catalog-lists): renumber one.
- `Cover` has no fallback when an image fails to load. No ticket yet.
- Search rank timeout (57014) returns 500, not 503.

## Notes
- Merging: autopilot-labelled PRs merge per OTA-176; everything else Farouk merges. `max_open_prs` is 6 (OTA-175).
- Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- OTA-173 follow-ups: web→API shared-secret guard, per-visitor limit, per-client limit on list/search endpoints, never-imported anime removal from cached lists.
- OTA-153 answers (Farouk, 2026-11-12): Pierce mark in the header site-wide; leaderboard per season; Trending reuses Top airing. Home mockups in `docs/design/home/`.
- Design follow-ups for builds: focus rings use `--accent` (~1.65:1 on light); use `--accent-ink`. Add `--medal-2/3` and `--ls-*` to `tokens.css`.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
