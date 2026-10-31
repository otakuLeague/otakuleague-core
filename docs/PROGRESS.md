# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-10-31 (night)

## Current milestone
W1 Live skeleton (Nov 2–8): OTA-133, OTA-134, OTA-97. W2 design and shell work running ahead via the autopilot.

## Last session
Autopilot run, OTA-152 global shell, slice 1 (branch `feat/OTA-152-global-shell`): `--brand-a/--brand-b` and `--header-h` in tokens.css, `app/styles/shell.css`, static background layer, `SiteFooter` (old-site links and socials, contact email, AniList credit) and the System/Light/Dark `ThemeSwitch` (cookie `ol-theme`, inline head script applies it before paint so the root layout stays PPR). Decisions: theme applied by a boot script instead of a server-read cookie (keeps Partial Prerendering); social icons stay letter marks until an icon source is chosen (no new dependency, no npm access in the cloud run).

## In progress
- OTA-152: slice 1 PR open (see ticket). Next slices: header (nav, Discover/account disclosure menus, header search → `/search`), mobile sheet + full-screen search, shell hidden on `/auth*` and `/onboarding`, 404/500 restyle, official social icons.
- OTA-97 anime page shell: parts 1–2 merged; part 3 (header + sticky bar) is PR #32, open.

## Next 3 tasks
1. Autopilot: OTA-152 slice 2 (header and menus), then OTA-154 / OTA-153 designs.
2. Review and merge PR #32 (OTA-97 part 3), then finish OTA-97 (season selector, per-tab titles).
3. OTA-133 / OTA-134: Railway and Vercel accounts (Farouk, ~15 min each).

## Blockers
- Railway and Vercel accounts must be created by Farouk (card needed for Railway).
- Cloud autopilot has no npm registry access: it can't `pnpm install`, so it relies on CI for lint/typecheck/tests and can't add packages (OTA-160).

## Known bugs
- Footer links to /faq, /contact, /privacy, /terms, /cookies 404 until OTA-147 adds those pages.

## Notes
- Dependabot PRs #33 and #18 open: merge when CI is green.
- Open design question: the ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use a teal accent (per-anime cover colour). v2 keeps the teal UI accent and uses purple → cyan only for the brand gradient.
