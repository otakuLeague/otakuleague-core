# 0011: Visual effects and motion budget

Status: accepted (2026-10-31, OTA-132). Applies to every Design and Build ticket.

## Context
v1 must look better than the old site *and* be faster. Wanted tools: Emil Kowalski's design-engineering skills, Impeccable, Playwright screenshots, and WebGL eye-candy (React Three Fiber, ShaderGradient, liquid glass, Paper's liquid-metal logo). WebGL libraries cost hundreds of kB and GPU time; anime pages and lists are the product and must stay fast on mid-range phones.

## Decision
- **Design workflow:** a "Design:" ticket produces HTML mockups + screenshots in `docs/design/<page>/` (the `design` skill) before its "Build:" ticket. Craft rules come from the vendored Emil skills (`emil-design-eng`, `animation-performance`, `review-animations`, `break-ui`, MIT). Since OTA-166 the vendored `web-design-guidelines` skill joins the craft pass, and the vendored GSAP and view-transition skills are reference for motion specs. Since OTA-188 Impeccable is vendored too (critique and audit references, reference only; no plugin, no hook). Taste-skill: not used (overlaps, runs install scripts).
- **Glass:** CSS `backdrop-filter` with a solid fallback is the default. A WebGL glass (liquidGL) only for one hero element, if a design ticket proves it's worth it.
- **WebGL allowed only on marketing surfaces** (home hero, launch moments, maybe the logo): R3F v9 / ShaderGradient or `@paper-design/shaders-react` (lighter, preferred for logo/gradient). Never on anime pages, lists, search or account pages.
- **Rules for any WebGL piece:** `next/dynamic` with `ssr: false`, mounted only when in view; a static poster (image or CSS gradient) renders first and stays as the fallback; `prefers-reduced-motion` and save-data show the poster only; pause when the tab is hidden; one canvas per page, `dpr` capped at 1.5, `frameloop="demand"` when idle; never on the LCP path.
- **Motion:** animate `transform`/`opacity` (and `clip-path`/`filter` sparingly); easing and duration as tokens in `tokens.css`; UI transitions 150–250 ms ease-out; no animation on high-frequency actions (typing, +1 episode).
- **Budgets (checked in OTA-148):** Lighthouse mobile ≥ 90 performance, ≥ 95 accessibility; first-load JS of non-marketing pages unaffected by WebGL (bundle analysis).

## Consequences
Every new dependency for visuals gets a size note in its PR. Visual ambition lives on the home page; the product pages win on clarity and speed.
