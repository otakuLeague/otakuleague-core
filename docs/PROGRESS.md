# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-01 (night)

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design and shell work running ahead via the autopilot.

## Last session
Autopilot run, OTA-154 browse design (branch `design/OTA-154-browse-pages`): `docs/design/browse/` with Seasonal, Rankings, Discover hub, Discover list (light) and States mockups, `browse.css` (fluid grid card, compact ranked row, control bar, filter chips, skeleton/empty/error), `motion.md` (route template, URL filter contract, motion table, a11y check), screenshots in `shots/`. Decisions: one list template for /season, /top/anime and /discover/*; filters in the URL, applied by the API; global ranks; "Show more" button instead of infinite scroll; no auto-advancing carousel; in-list text search, episode/score ranges and genre "match all" dropped for v1.

## In progress
- OTA-152 global shell: slice 1 is PR #37 (CI green, waiting for Farouk's merge: the autopilot's merge was blocked). Next slices: header and menus, mobile sheet, shell hidden on auth routes, 404/500.
- OTA-154 browse design: PR open (see ticket).
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.

## Next 3 tasks
1. Farouk: review and merge PR #37 (OTA-152 slice 1) and the OTA-154 design PR; then autopilot does OTA-152 slice 2.
2. Autopilot: OTA-99 is blocked by OTA-93; next designs are OTA-96 (search, W2) then OTA-155 (auth, W3).
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160).

## Known bugs
- Footer links to /faq, /contact, /privacy, /terms, /cookies will 404 until OTA-147 (once PR #37 merges).

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
