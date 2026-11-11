# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue. Done: OTA-97 (merged). API and Postgres are live on Railway; the OTA-133 docs PR is open (runbook in `docs/deploy.md`). OTA-134 (Vercel, `beta.otakuleague.com` resolves) and OTA-163 remain. W2 designs are merged (OTA-150, 151, 154, 99, 96); OTA-152 slice 1 merged.

## Last session
Autopilot on OTA-133 (branch `docs/OTA-133-railway-docs`), docs only. Railway settings were read through the Railway tools and written to `docs/deploy.md`. Settings live in the dashboard because `railway.json` is deprecated (per Farouk). Also: ADR 0009 addendum, restore and rollback steps (including `prisma migrate resolve` after a failed migration), and a deploy test plan. `/health` answers 2xx (Railway metrics). Backups are not confirmed.

## In progress
- OTA-133: docs PR, waiting for CI / automerge.

## Next 3 tasks
1. OTA-134 remaining: noindex on beta, document Vercel settings (build command `pnpm --filter @otakuleague/shared-types build && pnpm run build`), alias 308 test plan.
2. OTA-163: real-page screenshots in CI (protected path, Farouk merges).
3. OTA-100 Overview tab, OTA-152 global shell.

## Blockers
- OTA-168 (needs-human): enable Postgres volume backups, run the failed-migration and restart drills, decide Postgres 18 (prod) vs 16 (dev/CI).
- OTA-153 waits on OTA-160 (needs-human: brand moment decision).
- Cloud runs have Node 22 (repo wants 24) and Prisma engine downloads are blocked. The egress proxy blocks `*.up.railway.app`, so the autopilot cannot curl the API; use Railway MCP metrics. Only web and shared-types checks run locally; API checks rely on CI.

## Known bugs
- None tracked.

## Notes
- Dependabot PR #18 is open (#45 merged): merge when CI is green (it touches `package.json`, so never auto-merged).
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a source other than AniList (check terms per ADR 0006) or stays out of v1.
