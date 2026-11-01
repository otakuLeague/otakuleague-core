# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-01 (night)

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design work running ahead via the autopilot.

## Last session
Autopilot run, OTA-99 Overview tab design (branch `design/OTA-99-overview-tab`): mockups in `docs/design/overview-tab/` (Main = Frieren with trailer, Airing = ONE PIECE countdown + expanded synopsis + no trailer, Empty = no synopsis / no streams / all-spoiler tags, Loading = skeletons + one section error), `overview.css`, `motion.md` (structure, behaviour, motion, a11y), screenshots in `shots/`. Decisions: countdown at the top of the main column; mobile keeps DOM order (no CSS reordering, WCAG 1.3.2); no region filter for streaming links (AniList has no region data); trailer is click-to-load youtube-nocookie; spoiler preference is site-wide, stored in a cookie.

## In progress
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.
- Autopilot PRs open: #37 (OTA-152 global shell build, slice 1), #38 (OTA-154 browse designs), OTA-99 overview design.

## Next 3 tasks
1. Review and merge PR #32 (OTA-97 part 3), then finish OTA-97 (season selector, per-tab titles).
2. Autopilot: OTA-100 Build: Overview tab once OTA-99 is merged; then OTA-96 (search design).
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160).
- OTA-153 (Home design) waits on OTA-160 (needs-human) and OTA-150 (In Review).

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a source other than AniList (check terms per ADR 0006) or stays out of v1.
