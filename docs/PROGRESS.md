# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-10-31

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design work running ahead via the autopilot.

## Last session
Autopilot run, OTA-150 design system v2 (branch `design/OTA-150-design-system-v2`): motion tokens (`--ease-enter/exit/move/spring`, `--dur-press/exit/enter/move/spring`) and glass tokens in `tokens.css`, `.ol-glass` utility with solid fallback, `.ol-btn` and anime card transitions on the tokens, specimen mockups + screenshots and `motion.md` in `docs/design/system-v2/`. The shader brand prototype was split to OTA-160 (needs-human: the cloud environment can't reach registry.npmjs.org).

## In progress
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.

## Next 3 tasks
1. Review and merge PR #32 (OTA-97 part 3), then finish OTA-97 (season selector, per-tab titles).
2. OTA-151 Design: global shell (autopilot's next pick; uses `.ol-glass` and the motion tokens).
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160).

## Known bugs
- None tracked yet.

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
