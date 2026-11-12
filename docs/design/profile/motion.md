# Profile, XP and level-up: motion (OTA-157)

Transform and opacity only (ADR 0011, ADR 0012); colour and outline transitions on small elements are paint-only and allowed. Easing and duration tokens from `tokens.css`. Base UI Dialog for the edit dialog and the level-up card; Motion (`motion/react`) for component transitions; GSAP (`next/dynamic`, loaded only when an award has `levelledUp`) for the level-up timeline. The profile is a data page: nothing moves on load except the XP bar once.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| XP bar fill (profile, home card) | first paint, once | `scaleX(0)`→`scaleX(p)`, `transform-origin: left` | `--dur-spring` / `--ease-spring`, 150 ms delay; never `width` |
| Favourite cover lift | hover (fine pointer only) | `translateY(-2px)` | `--dur-enter` / `--ease-enter` |
| Tabs, favourites pages | navigation | none (server-rendered swap) | n/a |
| Edit dialog (desktop) | open / close | `opacity` + `scale(0.96)`→1 | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Edit sheet (phone) | open / close | `translateY(100%)`→0 | open `--dur-move` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Crop step | enter from the form | `opacity` + `translateX(16px)`→0 (back: reverse) | `--dur-move` / `--ease-move` |
| Username check, bio counter, Saved | typing | none: text swaps (high-frequency, ADR 0011) | n/a |
| Field error, file rejected | validation | `opacity` + `translateY(-4px)`→0; no shake | `--dur-enter` / `--ease-enter` |
| Visibility switch knob | toggle | `translateX(16px)` | `--dur-enter` / `--ease-enter` |
| Skeleton shimmer | loading | gradient `background-position` (`.ol-skel`) | 1.4 s, infinite; off with reduced motion |

## Level-up timeline (GSAP, about 1.6 s, then still)
Starts when the My List XP chip finishes (or right away if there is none).

| Time | What | Property | Easing |
| --- | --- | --- | --- |
| 0–200 ms | scrim fades in; card rises | scrim `opacity` 0→1; card `opacity` 0→1, `translateY(24px) scale(0.92)`→none | `--ease-enter` |
| 150–450 ms | bar finishes the old level | meter `scaleX(old)`→`scaleX(1)` | `--ease-move` |
| 450–650 ms | plate wipes to the new number | new number layer `clip-path: inset(0 100% 0 0)`→`inset(0)` along the slash; old number `opacity`→0.55 and shrinks to the corner (`scale(0.2)` + translate) | `--ease-move` |
| 500–1,100 ms | burst | 14 confetti spans `rotate(a) translateY(-d)` outward + `opacity`→0; one GSAP timeline, no canvas | `power3.out` |
| 500–1,600 ms | rays | conic layer `rotate(0)`→`rotate(25deg)` and `opacity` 0→0.8→0, once | `sine.inOut` |
| 650–1,100 ms | plate punch | `scale(1)`→`1.06`→`1` | `--ease-spring` |
| 700–1,150 ms | heading and copy | `opacity` + `translateY(8px)`→0, 60 ms stagger | `--ease-enter` |
| 900–1,350 ms | bar refills | meter reset to `scaleX(0)` instantly, then →`scaleX(p)` of the new level | `--ease-spring` |
| close | Nice!, Esc, scrim, See profile | card `opacity`→0 + `scale(0.96)`; scrim fades | `--dur-exit` / `--ease-exit` |

Several levels at once: the plate counts through each level number (one 120 ms wipe each, at most 3; above that it jumps to the final one), the burst plays once.

Screen readers: the card is a labelled dialog ("You reached level 13", "+80 XP for completing …"); focus moves to "Nice!" and returns to the control that triggered the award. Confetti and rays are `aria-hidden`.

## Reduced motion (`prefers-reduced-motion: reduce`)
No lift, scale, slide, wipe, burst, rays or shimmer. Dialogs, sheet and the level-up card fade (`opacity`, `--dur-enter`); the level-up card appears at its settled state (frame C); XP bars jump to their value. GSAP is not loaded at all.

## Performance
GSAP and the confetti markup load only on a level-up (dynamic import, so profile, list and leaderboard bundles are unaffected). Everything animated is a composited property; the rays layer is one element with a static conic gradient that only rotates. No `will-change` unless a device recording shows a 1 px shift. Pause is not needed (the timeline is 1.6 s and ends still).
