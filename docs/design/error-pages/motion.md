# Error pages: motion (OTA-212)

One ambient motion, nothing else. Rules: ADR 0011 (composite-only, tokens), `docs/design/system-v2/motion.md`.

| Element | Trigger | Property | Duration / easing | Reduced motion |
| --- | --- | --- | --- | --- |
| Art slot (`.err-art`, the whole mascot block) | page render, loops | `transform: translateY(0 → -5px)`, `alternate`, `infinite` | `--dur-ambient` (3200 ms) / `--ease-ambient` (`cubic-bezier(0.37, 0, 0.63, 1)`, sine in-out) | none: the art sits still |

- **Why float and not blink:** it moves the slot, not the SVG's parts, so it keeps working when a commissioned PNG or SVG replaces the drawing. On the 429 page it reads as slow breathing, which fits the sleepy pose.
- **Composite only:** `transform` on one element, no layout or paint properties, no `filter`, no `will-change` (a 200 px layer is cheap; the browser promotes it while the animation runs).
- **Gated** by `@media (prefers-reduced-motion: no-preference)`, so the default is still. CSS animation only: no JS, no Motion import, works in `global-error.tsx`. Browsers throttle it in hidden tabs.
- **Nothing else moves:** no entrance animation for the text or buttons (an error page should show its way out at once), no hover motion beyond the existing `.ol-btn` colour transition, no countdown ticking on the 429 page (the retry time is static text; see README).
- **New tokens:** `--dur-ambient` and `--ease-ambient` are defined in `errors.css` for the mockup; the Build ticket moves them into `apps/web/app/styles/tokens.css` (motion section) and documents them in `docs/design/system-v2/motion.md` as "ambient loops only". `global-error.tsx` cannot read tokens.css, so it inlines the same two values.
