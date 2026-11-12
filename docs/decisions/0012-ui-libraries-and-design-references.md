# 0012: UI libraries, motion stack and design references

Status: accepted (2026-11-11, OTA-165). Extends ADR 0011 (its budgets and motion rules still apply). Applies to every Design and Build ticket from now on.

## Context
Farouk wants the site to feel clean, crafted and fun, "not vibe coded". Until now the agents designed from the design system alone, with no reference products, and hand-wrote every interactive primitive (menus, dialogs, tabs) and animation. A reference to copy taste from is what most improves AI-made designs; hand-rolled primitives are where accessibility bugs hide.

## Decision

### Design references (copy their taste, never their branding, logos or exact layouts)
| Reference | What to take from it | Where it applies |
| --- | --- | --- |
| AniList | Information layout for anime data: dense but scannable facts, seasonal charts, list states | Anime page and tabs, seasonal, rankings, My List |
| Letterboxd | Poster-first browsing, the diary/review feel, profiles with favourites and stats | Browse grids, My List, profiles |
| Persona 5 menus | Bold angled panels, punchy transitions, high-contrast type | Neon night theme accents, home hero, XP and level-up moments (never on dense data screens) |
| Duolingo | Rewarding XP, streaks, level-ups and celebrations | XP, levels, leaderboard, achievements |
| Linear, Raycast | Polish: menus, hover states, ⌘K command palette, perceived speed | Global shell, search, every interactive control |
| Apple TV app | Hero banners and smooth poster carousels | Home, Discover |

Vibe: cool, modern, smooth, fun. Motion is part of the brand, but data pages stay calm and fast. Farouk may add screenshots of specific screens to `docs/design/references/`; when present, they beat this table.

### UI stack (add each library in the first PR that needs it, with its size note per ADR 0011)
| Need | Library | Rule |
| --- | --- | --- |
| Dialogs, menus, popovers, tabs, select, tooltips, combobox | **Base UI** (`@base-ui/react`, unstyled, MIT) | Default for any interactive primitive: no hand-rolled focus traps or ARIA menus. Styled with our tokens and `ol-*` classes. |
| Component animation (hover, press, enter/exit, list reorder, expand) | **Motion** (`motion/react`) | The default animation tool. Transform/opacity only; `useReducedMotion` respected. |
| Showpiece moments (scroll-scrubbed scenes, text reveals, SVG morphs) | **GSAP** + `@gsap/react` (`useGSAP`) | Only on the home page and celebrations (level-up). Loaded with `next/dynamic` so data pages never ship it. |
| Page transitions (poster → anime page morph) | React `<ViewTransition>` | Progressive enhancement: navigation works without it. Verify the React version supports it stably before use. |
| Carousels | **Embla** | Native scroll snap first; Embla when arrows, drag or loop are needed. |
| Smooth scroll | **Lenis** | Home page only, light settings; never on long data pages or with reduced motion. |
| Toasts, "+50 XP" popups | **Sonner** | One toaster in the root layout. |

Rules for all of them: `prefers-reduced-motion` turns motion off (opacity fades may stay); animate `transform`/`opacity` only (ADR 0011); no animation on high-frequency actions (typing, +1 episode); check the license and the gzipped size before the first install and put both in the PR; the budgets in ADR 0011 (Lighthouse mobile ≥ 90/95) still decide.

### Accounts (OTA-138)
**Better Auth** with its Prisma adapter (sessions in our Postgres, no paid service) and **Resend** for verification and reset emails (free tier). OTA-138 becomes a confirmation spike: check the license, the current version, the Prisma adapter and NestJS integration, then record it in its own ADR.

### Monitoring
Turn on **Sentry** (free Developer plan) with the setup ADR 0004 already prepared; filter browser-extension and bot noise so the free quota lasts. Needs Farouk to create the account (a ticket lists the steps).

### Design skills
Vendor into `.claude/skills/`, only from the official repos and after a license and full-content read (a skill is instructions the autopilot follows): **Impeccable** (`pbakaus/impeccable`: critique, audit, anti-"AI slop" rules), Vercel's **web-design-guidelines**, **react-best-practices** and **vercel-react-view-transitions** (`vercel-labs/agent-skills`), and GSAP's skills (`greensock/gsap-skills`). Our `design` skill stays the workflow; these are used inside its craft pass. Vendoring changes `.claude/`, so Farouk merges it.

## Consequences
- New pages use Base UI primitives and Motion by default; existing hand-rolled controls (global shell menus, tabs) move to Base UI when their ticket next touches them, not in a rewrite.
- Each library lands in the PR that first needs it, so `package.json` changes stay small and Farouk reviews each one (protected path).
- Some facts above (versions, licenses, "stable" APIs) come from research done on 2026-11-11; the architect re-checks them when a library is first added.

## Addendum (2026-11-11): bolder design, motion-first references
Decision (Farouk): the new site does **not** have to look like the old one. The old purple/cyan palette, the orb background and the existing mockups are a starting point, not a rule. A bolder visual identity with richer animation and more dynamic pages is welcome whenever it makes the product better. PARITY.md still governs **features and behaviour**, never colours or look.

New references, for ambition in motion and art direction (immersive scroll, page transitions, WebGL or shader moments, playful micro-interactions, strong typography). Study the real sites when designing; copy taste, never their branding, assets or exact layouts:

- https://terminal-industries.com
- https://microsoft.ai
- https://landonorris.com
- https://glenncatteeuw.com
- https://www.1x.tech
- https://ribbit.dk
- https://sunmetalon.com
- https://ponpon-mania.com/fr
- https://symphonyofvines.unseen.co
- https://bennos-light.org

Where to spend it: the home hero, landing and marketing moments, page transitions, the anime page header, XP and level-up moments. Data-heavy screens (lists, tabs, rankings) stay fast and readable, with motion as polish rather than spectacle.

What still holds: ADR 0011's performance rules (poster or static first paint, nothing heavy on the LCP path, `prefers-reduced-motion` honoured, pause when hidden) and accessibility. A heavier effect, or a new animation library, is fine when the PR states its cost; a new dependency still needs Farouk's merge.

## Status update (2026-11-12, OTA-166)

- Slice 1 vendored `gsap-core`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-utils`, `vercel-react-view-transitions` and `web-design-guidelines` into `.claude/skills/` (guidelines pinned locally, no runtime fetch). Edits to the vendored files are listed in each folder's `SOURCE.md`.
- `gsap-frameworks` left out (Vue, Svelte and Nuxt only, outside our stack).
- Impeccable and react-best-practices follow in OTA-188 (Impeccable is Apache-2.0 and ships scripts that must be left out).
