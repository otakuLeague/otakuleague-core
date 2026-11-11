# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-01 (early morning)

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design work running ahead via the autopilot.

## Last session
Autopilot run, OTA-96 search design (branch `design/OTA-96-search-page`): mockups in `docs/design/search/` (Main = `?q=aot` nickname hits with an "Also known as" match line, Light = filtered `?q=titan`, DidYouMean = auto-corrected `?q=freiren` + plain empty state, UnknownSlug = `/anime/<bad-slug>` 404 with 3 close matches, States = landing / loading / error, FilterSheet = mobile sheet), `search.css`, `motion.md`, screenshots in `shots/`. Decisions: search reuses the OTA-154 browse template; submit-on-Enter on the page (instant suggestions stay in the header popover); zero results + close title → show the corrected results with a "search for X only" escape; unknown slug → 404 with candidates, never an auto-redirect; no recent searches in v1; 24 per page, max 50.

## In progress
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.
- Autopilot PRs open: #37 (OTA-152 global shell build, slice 1), #38 (OTA-154 browse designs), OTA-96 search design.

## Next 3 tasks
1. Review and merge PR #32 (OTA-97 part 3), then finish OTA-97 (season selector, per-tab titles): it unblocks OTA-100 (Build: Overview tab).
2. Autopilot: next unblocked ticket is in W3 (OTA-135 catalog list API or OTA-155 auth design); OTA-98 (Build: search) once this design is merged.
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160). Design screenshots work by linking the preinstalled global Playwright into a temporary `node_modules/`.
- OTA-153 (Home design) waits on OTA-160 (needs-human) and OTA-150 (In Review).

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a source other than AniList (check terms per ADR 0006) or stays out of v1.
