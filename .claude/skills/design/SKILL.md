---
name: design
description: Design one page or component for OtakuLeague as a reviewable HTML mockup with screenshots, before any build ticket. Use for Linear tickets titled "Design: ...", or "/design <page>".
argument-hint: "<OTA key or page name>"
---
Design target: $ARGUMENTS

Goal: a mockup good enough that the matching "Build:" ticket only has to translate it into components. Better than the old site, never a copy of another product's branding.

1. **Inputs (read only these):** the ticket, `docs/PARITY.md` (what the old page did), `apps/web/app/styles/tokens.css` and `components.css` (current design system, OTA-91), ADR 0011 (visual and motion rules), ADR 0012 (design references to copy taste from, and the UI and motion libraries the build will use: design with what Base UI and Motion can do), any screenshots in `docs/design/references/`, and existing mockups in `docs/design/` for consistency. Look at the old page's files only if PARITY.md is unclear.
2. **Direction (5 lines max in the PR):** what the page must make easy, the hierarchy, the one memorable moment (if any), what you removed from the old page and why.
3. **Mockup:** `docs/design/<page>/mockup-<State>.html`, self-contained (inline CSS using the tokens, no external JS, placeholder anime data from recorded fixtures, no hotlinked artwork: use neutral gradient placeholders). States: Main, Mobile (390 px), Light theme if the page differs, Loading, Empty, Error. Real content lengths: long titles, missing fields (use the break-ui skill on the main component).
4. **Craft pass:** apply the emil-design-eng skill (spacing, hierarchy, focus states, motion decisions). Run the vendored `impeccable` skill's critique on the mockup (`.claude/skills/impeccable/reference/critique.md`), then its technical audit (`.claude/skills/impeccable/reference/audit.md`). Motion: describe it in a `motion.md` next to the mockup (trigger, property, duration, easing token), following animation-performance; never animate layout properties.
5. **Screenshots:** `node scripts/design/shots.mjs docs/design/<page>` writes PNGs to `docs/design/<page>/shots/` (desktop 1440 and mobile 390). Look at every screenshot yourself and fix what looks off before continuing: alignment, contrast, truncation, overflow, empty space.
6. **Accessibility check:** contrast ≥ 4.5:1 for text, visible focus, hit targets ≥ 44 px on mobile, no information by colour alone, reduced-motion behaviour stated.
7. **Ship:** PR titled `design(OTA-<n>): <page> mockups` with the screenshots linked in the body, plus open questions for Farouk at the end (max 3). Update the Build ticket's description with a link to the mockups and any changed acceptance criteria.
