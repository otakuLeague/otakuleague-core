# My List and add-to-list control: motion (OTA-156)

Transform and opacity for anything that moves (ADR 0011, ADR 0012); colour, border and outline transitions on small elements are paint-only and allowed. Easing and duration tokens from `tokens.css`. Base UI for Popover, Dialog (sheet) and Menu; Motion (`motion/react`) only for the XP chip and the remove fade; Sonner for toasts. No layout property is animated anywhere: entries that leave or arrive do not push their neighbours with animation, the grid reflows instantly.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Card cover lift | hover (fine pointer only) | `translateY(-2px)` + outline colour | `--dur-enter` / `--ease-enter` |
| Card hover actions (+1 ep, ⋯) | hover / focus-within | `opacity` 0→1 | `--dur-enter` / `--ease-enter`; always visible with `hover: none` |
| **+1 episode** (card, row, header, popover) | press | none. Number swaps instantly, press feedback `scale(0.96)` on `:active` with no transition | n/a (high-frequency action, ADR 0011) |
| Status tab change, sort, view toggle, search results | navigation / response | none (content swaps; it's a data screen) | n/a |
| Edit popover (desktop) | open / close | `opacity` + `scale(0.96)`→1, `transform-origin: var(--transform-origin)` (from the trigger) | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Edit sheet (phone) | open / close (Esc, scrim, grabber, Close) | `translateY(100%)`→0. No drag-to-dismiss in v1: Base UI Dialog has no drag, and adding a gesture library is not worth it here | open `--dur-move` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Card quick menu | open / close | `opacity` + `scale(0.97)` from the + button | open `--dur-enter`, close `--dur-exit` |
| Favourite switch knob | toggle | `translateX(18px)` | `--dur-enter` / `--ease-enter` |
| Saved / Saving / Not saved | each write | text swap, `opacity` fade | `--dur-exit` / `--ease-enter` |
| Inline error (row, card, popover) | failed write | `opacity` + `translateY(-4px)`→0; no shake | `--dur-enter` / `--ease-enter` |
| Removed entry (on /my-list) | Remove | `opacity`→0 + `scale(0.98)`, then unmounted; neighbours reflow without animation | `--dur-exit` / `--ease-exit` |
| Undo toast / error toast | Sonner | Sonner defaults (transform/opacity) | Sonner |
| **XP chip** ("+40 XP") | server response with points > 0 (add, mark watching, mark completed, mark dropped, rate) | `translateY(0)`→`-16px` with `scale(0.9)`→1 in, then `opacity`→0 | in `--dur-spring` `--ease-spring`, hold 600 ms, out `--dur-exit` `--ease-exit` (≈1.2 s total) |
| **Completed toast** (the moment) | the final +1 (progress reaches a known total, the API stores COMPLETED and awards `list.mark_completed`), "Mark all N watched", or choosing Completed | toast enters (Sonner); level bar fill `scaleX(old)`→`scaleX(new)`, `transform-origin: left`, starts 150 ms after the toast | `--dur-spring` / `--ease-spring` |
| Completed sheen (card cover) | entry becomes Completed while visible | gradient pseudo-element `translateX(-100%)`→`100%`, once | 600 ms `--ease-move` |
| Level up | the award crosses a level | hands off to the level-up celebration (separate design, GSAP via `next/dynamic`); this page only fires the event | n/a |
| Skeleton shimmer | loading | `translateX` of a gradient (browse `.br-skel`) | 1.4 s `--ease-move`, infinite |

Rules for the XP feedback: never on a plain +1 (only the final +1 that completes the show, or a +1 that moves Plan to watch / On hold to Watching and earns `list.mark_watching`), never for a quick update that the server does not reward, never "0 XP". Several awards within 2 s merge into one chip and one toast. The chip is `aria-hidden`; the toast text ("Completed! +40 XP") is the announced version (`role="status"`).

Reduced motion (`prefers-reduced-motion: reduce`): no lift, no scale, no slide, no sheen, no shimmer; popover, sheet, menu, chip and toast use opacity fades only; the level bar jumps to its new value.

Performance: everything above is CSS transitions or WAAPI-backed Motion with full `transform` strings (not the `x`/`y` shorthands), so nothing is driven per frame from React state. The progress bars use `scaleX`, never `width`. No `will-change` unless a device recording shows a 1 px shift.
