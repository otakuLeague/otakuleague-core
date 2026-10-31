# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-10-31 (evening)

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design work running ahead via the autopilot.

## Last session
Autopilot run, OTA-151 global shell design (branch `design/OTA-151-global-shell`): mockups in `docs/design/global-shell/` (signed-in + Discover menu, guest + header search, light + account menu, mobile header/sheet/full-screen search, 404/500 + search states), `shell.css` with real transitions and reduced-motion rules, `motion.md` (structure, active section, focus order, ARIA patterns, motion table, static background, a11y check), screenshots in `shots/`. Decisions: Search nav link replaced by the header search box; theme toggle (System/Light/Dark) in account menu, sheet and footer; static gradient + masked grid background.

## In progress
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.

## Next 3 tasks
1. Review and merge PR #32 (OTA-97 part 3), then finish OTA-97 (season selector, per-tab titles).
2. Autopilot: OTA-152 Build: global shell (unblocked once OTA-151 is merged), then OTA-154 / OTA-153 designs.
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160).

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
