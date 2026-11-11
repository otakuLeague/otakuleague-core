# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue: OTA-133, OTA-134 (Farouk's accounts), OTA-97 (PR #32), OTA-161. W2 designs are merged (OTA-150, 151, 154, 99, 96); OTA-152 slice 1 merged.

## Last session
OTA-161 (branch `chore/OTA-161-autopilot-automerge`): the cloud safety check blocked the autopilot's self-merge on PR #40, so merging moves to GitHub. New `.github/workflows/autopilot-merge.yml` squash-merges a same-repo PR labelled `automerge` when every check on its head commit is green and no file matches `.github/autopilot-protected-paths` (read from main). The autopilot skill now only adds the label. CLAUDE.md: a cloud clone without `.env` is expected. Skills use the GitHub MCP tools where `gh pr` gets 403. The autopilot scheduled task has been off since Nov 2.

## In progress
- OTA-161: PR open, touches protected paths, so Farouk merges it.
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, green, waiting for review.

## Next 3 tasks
1. Merge OTA-161, then turn the "OtakuLeague autopilot" scheduled task back on.
2. Merge PR #32, then finish OTA-97 (season selector, per-tab titles): unblocks OTA-100 and the other anime-page tabs.
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- OTA-153 (Home design) waits on OTA-160 (needs-human: brand moment decision).
- Cloud runs: the npm registry is reachable now (checked 2026-11-11 with `npm view`); `pnpm install` there is not verified yet. Design screenshots work by linking the preinstalled global Playwright into a temporary `node_modules/`.

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #42, #43 and #18 open: merge when CI is green (they touch `package.json`/workflows, so never auto-merged).
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a source other than AniList (check terms per ADR 0006) or stays out of v1.
