# About/FAQ, contact and legal: motion (OTA-158)

Transform and opacity only (ADR 0011, ADR 0012); colour transitions on small elements are paint-only and allowed. Durations and easings are the tokens in `tokens.css`. These are reading pages: nothing moves on load, no smooth-scroll library (Lenis is home-only).

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| FAQ answer | `<details>` opens | answer `opacity` 0→1 + `translateY(-4px)`→0 (the height changes at once; no height animation) | `--dur-enter` / `--ease-enter` |
| FAQ +/− icon | open / close | vertical bar `rotate(90deg)`→`0` | `--dur-enter` / `--ease-enter` |
| FAQ number plate | open | background swaps to the gradient (paint, small element) | instant |
| Question title | hover (fine pointer) | `color` → accent-ink | `--dur-press` / `--ease-enter` |
| Contact / Discord card arrow | hover (fine pointer) | `translateX(3px)` | `--dur-enter` / `--ease-enter` |
| Contact field error, alert | validation, failed submit | `opacity` + `translateY(-4px)`→0; no shake | `--dur-enter` / `--ease-enter` |
| Counters | typing | none (text swap, high-frequency) | n/a |
| Send button | sending | spinner `rotate` loop | 0.8 s linear |
| Sent panel | success | form `opacity`→0 (`--dur-exit`), then panel `opacity` + `translateY(8px)`→0; check mark `scale(0.6)`→1 | `--dur-move` / `--ease-spring` for the mark |
| Legal anchor "#" | heading hover / focus | `opacity` 0→1 | `--dur-press` / `--ease-enter` |
| TOC current item | scroll (IntersectionObserver) | bar position via `transform: translateY()` | `--dur-move` / `--ease-move` |
| TOC jump | click | native anchor jump; `scroll-behavior: smooth` only without reduced motion | browser |
| Phone "On this page" | open | list `opacity` 0→1 | `--dur-enter` / `--ease-enter` |

## Reduced motion
`prefers-reduced-motion: reduce`: no transforms (FAQ answer and sent panel only fade, the check mark appears at full size, arrows stay still), anchor jumps are instant, the spinner is replaced by "Sending…" alone.
