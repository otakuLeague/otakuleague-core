# Auth and onboarding: motion (OTA-155)

Transform and opacity only (ADR 0011), tokens from `tokens.css`. Base UI Dialog / AlertDialog for the sign-in prompt and the skip confirm; Motion (`motion/react`) for step changes. Nothing animates while typing.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Form card | page load / mode switch (sign-in ↔ sign-up) | `opacity` 0→1, `translateY(8px)`→0 | `--dur-enter` / `--ease-enter` |
| Showcase poster tiles | ambient, desktop only | `transform: translateY(-6px) rotate(±1deg)`, alternate, infinite, staggered 0 / 2 / 4 s | 7 s `cubic-bezier(0.45,0,0.55,1)` (home's `--ease-drift`) |
| "+50 XP" chip on showcase | ambient | `translateY(-4px)` alternate | 4 s, `--ease-drift` |
| Field message (error, availability) | value changes after debounce / submit | `opacity` + `translateY(-4px)`→0 | `--dur-exit` in / out, `--ease-enter` |
| Alert (401, 429, 5xx) | response | `opacity` + `translateY(-4px)` | `--dur-enter` / `--ease-enter` (no shake) |
| Password rule tick | rule becomes met | check `scale(0.6)`→1 + opacity | `--dur-spring` / `--ease-spring` |
| Submit spinner | pending | `rotate` loop | 0.8 s linear |
| 429 countdown | every second | text only, no animation | n/a |
| Dialog (desktop) | open / close | scrim `opacity`; panel `scale(0.96)`+`opacity` | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Dialog (phone, bottom sheet) | open / close | `translateY(100%)`→0 | open `--dur-move` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Onboarding step | Continue / Back | outgoing `opacity`→0 + `translateX(∓24px)`, incoming from `±24px` (direction follows Continue/Back) | `--dur-move` / `--ease-move` |
| Progress segment | step done | fill bar `scaleX(0→1)` from the left (`transform-origin: left`) | `--dur-move` / `--ease-move` |
| Avatar crop | drag / zoom | `transform: translate() scale()` on the image, follows the pointer 1:1, no easing | n/a |
| Verified (memorable moment) | page load | badge `scale(0.6)`→1 + opacity, then "+50 XP" chip `translateY(8px)`→0 + opacity, 120 ms later | `--dur-spring` / `--ease-spring` |
| Unverified banner | server-rendered, no entrance (no layout shift); dismiss | `opacity`→0 then removed | `--dur-exit` / `--ease-exit` |

Ambient loops run only with `prefers-reduced-motion: no-preference`, visible tab, no Save-Data (same island rule as home). Reduced motion: no ambient loops, no slides or scale; dialog, alerts, steps and verified badge use opacity fades only; the spinner slows to 2.4 s (still shows progress). Never animate the scrim blur (the scrim is a plain tint).
