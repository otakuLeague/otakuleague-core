# Settings: motion (OTA-158)

Transform and opacity only (ADR 0011, ADR 0012); colour transitions on small elements are paint-only and allowed. Durations and easings are the tokens in `tokens.css`. Base UI for the select and the AlertDialog, Motion (`motion/react`) for enter/exit. Settings is a calm page: nothing moves on load.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Section nav current marker | scroll into a section (IntersectionObserver) | marker `transform: translateY()` between items; chip row on phones scrolls the current chip into view (`scrollIntoView({ inline: 'nearest' })`, instant) | `--dur-move` / `--ease-move` |
| Row form open / close | "Change" / Cancel | form `opacity` 0→1 + `translateY(-4px)`→0; the row grows without animating height (instant) | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Field error, alert | validation, failed submit | `opacity` + `translateY(-4px)`→0; no shake | `--dur-enter` / `--ease-enter` |
| Username check, rule ticks, counters | typing | none: text swaps (high-frequency, ADR 0011) | n/a |
| Switch knob | toggle | `translateX(16px)` | `--dur-enter` / `--ease-enter` |
| "Saved" status | save succeeds | `opacity` 0→1, stays 2 s, then 1→0 | in `--dur-enter` `--ease-enter`, out `--dur-exit` `--ease-exit` |
| Switch revert on error | save fails | knob back with the same transition; the error text fades in | as above |
| Busy button spinner | saving | `rotate` loop (`.au-spin`) | 0.8 s linear |
| Language menu | open / close | `opacity` + `scale(0.97)`→1, `transform-origin` at the trigger | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Delete dialog (desktop) | open / close | scrim `opacity`; card `opacity` + `scale(0.96)`→1 | open `--dur-enter` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Delete sheet (phone) | open / close | `translateY(100%)`→0 | open `--dur-move` `--ease-enter`, close `--dur-exit` `--ease-exit` |
| Toasts (username changed, account deleted) | after success | Sonner default (`translateY` + `opacity`) | `--dur-move` / `--ease-enter` |
| Skeleton | loading | `.ol-skel` shimmer | 1.4 s; off with reduced motion |

No hover lift on the danger button (a destructive action should not feel playful).

## Reduced motion
`prefers-reduced-motion: reduce`: every transform is dropped; opacity fades stay (`--dur-enter`). The switch knob jumps, the nav marker jumps, the dialog and sheet only fade, skeletons are static, the spinner is replaced by the "Saving…" text alone.
