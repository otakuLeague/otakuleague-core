# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Merged on main and Done: OTA-98 slice 1 (#62), OTA-135 slice 1 (#63), OTA-173 (#70), OTA-174 (#71), OTA-183 deploy-order guard (#72), OTA-147 legal/info pages slice 1 (#69), designs OTA-155/156/157/158 (#64, #66, #67, #68), OTA-138 ADR 0015 auth (#65).

## Last session
OTA-166 slice 1 (open, draft then ready): vendored GSAP, `vercel-react-view-transitions` and `web-design-guidelines` skills into `.claude/skills/`, each with LICENSE and SOURCE.md (edits to vendored text listed there). `gsap-frameworks` left out. Guidelines pinned locally, no runtime fetch. Protected path (`.claude/`): Farouk merges.

## In progress
- Backlog: OTA-188 slice 2, Impeccable (Apache-2.0, scripts left out) and react-best-practices.
- OTA-147 remaining slices: `/contact` (slice 2, needs the email provider; until then FAQ and footer use `mailto:contact@otakuleague.com`). Launch gate: Vercel and other DPAs, account-deletion wording (OTA-180/181), Google sign-in text (OTA-179), contact mailbox host, AnimeThemes credit on the Music tab (OTA-107).

## Next 3 tasks
1. OTA-185 review checklist for AI-written React (protected path, Farouk merges).
2. OTA-177 catalog list slices 2–3: seasonal + genre lists, then slug claiming.
3. OTA-136 Build Home page, after the OTA-177 seasonal list. Logo component (unique gradient ids), motion island, `--ease-drift` into tokens.css, hide `.sh-bg` on home, browse row changes.

## Blockers
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Cloud runs have no Prisma engines, so API typecheck and integration specs run in CI only.
- Google Fonts are blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs (ESM ignores `NODE_PATH`): run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.
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
