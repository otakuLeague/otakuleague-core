# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue. Done: OTA-97, OTA-134. API and Postgres live on Railway (OTA-133 docs PR #50 open, green). OTA-163 PR open (Farouk merges: protected paths). W2 designs merged (OTA-150, 151, 154, 99, 96); OTA-152 slice 1 merged.

## Last session
Autopilot on OTA-163 (branch `chore/OTA-163-pr-screenshots`, ADR 0013). New workflow `.github/workflows/screenshots.yml`: `capture` job (read-only token) builds the app, migrates a Postgres 16 service, serves recorded AniList/Jikan fixtures from `scripts/screenshots/fake-sources.mjs` behind the existing `ANILIST_API_URL`/`JIKAN_API_URL`, and screenshots the routes in `scripts/screenshots/routes.json` at 1440/390, dark/light, with Playwright 1.63.0 installed into `$RUNNER_TEMP` (no new dependency). The browser may only reach localhost (ADR 0006: no re-hosted covers). `publish` job (write token, runs no repo code) treats the artifact as hostile: allowlisted PNG names only, pushes an orphan commit to `screenshots/pr-<n>` (with a `vercel.json` disabling deploys), builds the sticky comment itself (marker `<!-- pr-screenshots -->`), prunes branches of closed PRs. Only an app crash fails the job. `autopilot-merge.yml` now also listens to Screenshots.

## In progress
- OTA-163: PR open, waits for Farouk (protected paths). First run measures job time (target < 5 min); check Vercel ignores `screenshots/pr-*`.
- OTA-133: docs PR #50.

## Next 3 tasks
1. OTA-152 global shell build (Todo), then OTA-100 Overview tab.
2. After OTA-163 merges: page reports use the real screenshots (skill step 7 already updated).
3. After both deploy PRs merge: link `docs/deploy-vercel.md` from ADR 0009 and architecture.md.

## Blockers
- OTA-168 (needs-human): Postgres volume backups, deploy drills, Postgres 18 vs 16.
- OTA-153 waits on OTA-160 (needs-human: brand moment decision).
- Cloud runs have Node 22 (repo wants 24), no `node_modules`, Prisma engine downloads blocked: lint/typecheck/API tests rely on CI. The egress proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.

## Known bugs
- `Cover` has no fallback when an image fails to load (visible in CI screenshots, where CDN images are blocked). No ticket yet.

## Notes
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 open: merge when CI is green (touches `package.json`, never auto-merged).
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use teal. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
