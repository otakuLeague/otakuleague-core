# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue. Done: OTA-97. API and Postgres live on Railway (OTA-133 docs PR #50 open). Web live on Vercel at beta.otakuleague.com; OTA-134 finishing PR open. OTA-163 remains. W2 designs merged (OTA-150, 151, 154, 99, 96); OTA-152 slice 1 merged.

## Last session
Autopilot on OTA-134 (branch `chore/OTA-134-vercel-beta`). Beta is kept out of search engines by a code constant `SEARCH_INDEXING = 'blocked'` (`apps/web/src/seo/indexing.ts`), not an env var: beta is the production deploy of main, so no Vercel variable tells it apart, and a new variable would touch `.env.example` (protected). It drives the root `metadata.robots` and an `X-Robots-Tag: noindex, nofollow` header from `next.config.ts` (async `generateMetadata` streams the meta into `<body>`, and global-error has none). No robots.txt `Disallow`, which would hide the noindex. A guard test fails if any other `app/` file sets `robots`. Vercel settings documented in `docs/deploy-vercel.md` (separate file to avoid conflicting with PR #50's `docs/deploy.md`).

## In progress
- OTA-134: this PR (automerge when green). `NEXT_PUBLIC_SENTRY_DSN` moved to OTA-167.
- OTA-133: docs PR #50.

## Next 3 tasks
1. OTA-163: real-page screenshots in CI (protected path, Farouk merges).
2. OTA-152 global shell build (Todo), then OTA-100 Overview tab.
3. After both deploy PRs merge: link `docs/deploy-vercel.md` from ADR 0009 and architecture.md (skipped now to avoid conflicts with #50).

## Blockers
- OTA-168 (needs-human): Postgres volume backups, deploy drills, Postgres 18 vs 16.
- OTA-153 waits on OTA-160 (needs-human: brand moment decision).
- Cloud runs have Node 22 (repo wants 24) and Prisma engine downloads are blocked. The egress proxy blocks `*.up.railway.app` and `beta.otakuleague.com`, so the autopilot cannot curl deploys; the OTA-134 test plan (308 alias, robots tag) needs Farouk or CI. Only web and shared-types checks run locally; API checks rely on CI.

## Known bugs
- None tracked.

## Notes
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 open: merge when CI is green (touches `package.json`, never auto-merged).
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use teal. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
