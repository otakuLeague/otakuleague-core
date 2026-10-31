# Design system v2: motion and glass (OTA-150)

Tokens live in `apps/web/app/styles/tokens.css`; the glass utility in `components.css`. Rules from ADR 0011 and the vendored `emil-design-eng` / `animation-performance` skills. Mockup: `mockup-Main.html` (dark) and `mockup-Light.html`, screenshots in `shots/`.

## Easing and duration

| Use | Easing | Duration | Examples |
| --- | --- | --- | --- |
| Press feedback | `--ease-enter` | `--dur-press` (120 ms) | button `scale(0.97)`, button colour change |
| Something appears | `--ease-enter` (strong ease-out) | `--dur-enter` (200 ms) | menu, popover, tooltip, toast, tab panel fade, card hover lift and glow |
| Something leaves | `--ease-exit` (gentle, symmetric) | `--dur-exit` (150 ms) | menu closing, toast dismissed |
| Something already on screen moves | `--ease-move` (ease-in-out) | `--dur-move` (250 ms) | active-tab indicator, sticky bar sliding in, drawer |
| A playful reward | `--ease-spring` (≈7 % overshoot) | `--dur-spring` (450 ms) | XP gained, level-up badge, "added to list" check |

- Exits are shorter than entrances: nobody watches a thing leave.
- No `ease-in` on UI: it delays the moment the user is looking at.
- `--ease-spring` is a CSS `linear()` curve (Chrome 113, Safari 17.2, Firefox 112). An older browser treats the declaration as invalid and drops that transition: the change is instant, nothing breaks. If a gesture must stay interruptible with momentum, that's a Build-ticket decision for Motion's `useSpring`, not a token.
- Never animate: typing, `+1 episode`, score edits, list filtering (high-frequency actions, ADR 0011). Anything over 300 ms is for marketing surfaces or rewards only.

## Properties

- Movement and appearance: `transform` and `opacity` only; `clip-path` for reveals and `filter: blur(≤ 4px)` to soften a crossfade, sparingly. Never `width`, `height`, `top`, `left`, `margin`.
- Colour, `outline-color` and `box-shadow` may transition on small elements (buttons, a card's cover) at press/enter durations: they repaint only that element.
- List every property in `transition` (never `all`), each with a token pair: `transition: transform var(--dur-press) var(--ease-enter)`.
- `will-change` only on an element that is about to animate and is expensive to paint; remove it after.

## Reduced motion

`prefers-reduced-motion: reduce`: drop movement (`transform`), keep short opacity fades (they carry meaning, e.g. a menu appearing). Each component states it next to its transition, as `.ol-btn` and `.ol-anime-card` already do. Rewards show their end state with no overshoot.

## Glass (`.ol-glass`)

- Solid `--surface` + `--border` by default. Where `backdrop-filter` is supported: surface at `--glass-tint` (72 %) over a `--glass-blur` (16 px) + `--glass-saturate` (1.4) backdrop. `prefers-reduced-transparency: reduce` goes back to solid.
- Works in both themes because the tint is mixed from the theme's own `--surface`; text on it stays `--ink` / `--muted` (contrast is checked against the solid fallback, the worst case being a bright cover behind it, see the mockup).
- Use on small, static, overlaying elements: sticky header, sticky anime bar, menus, score badges on covers. Never animate the blur, never a full-screen glass layer, at most a few on screen (each one repaints what scrolls under it, which costs most in Safari).
- Safari needs the `-webkit-` prefix, which the utility includes. Frosted only when both `backdrop-filter` and `color-mix()` are supported.
- Existing exception: the score badge on anime cards keeps its own 6 px blur over a mostly opaque tint (OTA-91); move it to `.ol-glass` only if the Build ticket touches the card.

## Brand moment (not in this slice)

The liquid-metal logo and shader hero background (`@paper-design/shaders-react`) need the package and measurements on a real device profile; they move to a follow-up ticket (see the PR). Direction for it: purple → cyan gradient (the old site's identity, PARITY.md), static CSS poster first, WebGL only on the home hero.
