# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue: OTA-133, OTA-134 (Farouk's accounts), OTA-97, OTA-163. W2 designs are merged (OTA-150, 151, 154, 99, 96); OTA-152 slice 1 merged.

## Last session
Autopilot run on OTA-97 (branch `feat/OTA-97-season-selector`): season selector in the anime page header. Disclosure button + list of links (not the mockup's listbox), keeps the current tab, loads the franchise in its own Suspense so the header never waits. Hidden for one season, on franchise failure, or when no other season is imported yet; seasons without a slug are listed but disabled. New `isAnimeFranchise` guard in shared-types. Per-tab titles, link previews and slug redirects (308, tab kept) were already on main.

## In progress
- OTA-97: this PR (634 lines, 285 of them tests: over the ~400 budget, so no `automerge`; Farouk reviews).

## Next 3 tasks
1. Review/merge the OTA-97 season selector PR.
2. OTA-97 later slices (new tickets): `/anime/anilist/[id]/[[...tab]]` redirect so un-imported seasons are clickable; phone bottom sheet; refresh while franchise is `walking`; "saved data" outage banner (needs an API signal); per-anime "View on AniList" attribution.
3. OTA-163 (real-page screenshots in CI; protected path, Farouk merges), then OTA-100 Overview tab.

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- OTA-153 (Home design) waits on OTA-160 (needs-human: brand moment decision).
- Cloud runs have Node 22 (repo wants 24) and Prisma engine downloads are blocked: only web and shared-types checks run locally (`pnpm install --config.engine-strict=false --filter '@otakuleague/web...' --filter .`); API checks rely on CI.

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #45 and #18 open: merge when CI is green (they touch `package.json`, so never auto-merged).
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a source other than AniList (check terms per ADR 0006) or stays out of v1.
