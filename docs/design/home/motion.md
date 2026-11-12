# Home: motion, behaviour and accessibility (OTA-153)

Mockups: `mockup-Main.html` (guest, dark), `mockup-Light.html`, `mockup-SignedIn.html`, `mockup-Mobile.html` (two 390 px phones), `mockup-Poster.html` (hero poster frame, LCP marked), `mockup-Loading.html`, `mockup-Error.html` (failures and empty rows). Styles: `home.css` on top of tokens.css, components.css, `../global-shell/shell.css` and `../browse/browse.css` (card, section row, skeleton, inline error are reused as is). Screenshots in `shots/`. Build ticket: OTA-136.

## LCP element
The hero `h1` ("Track every anime. Earn XP. Top the season."). Plain text in the first HTML, no entrance animation, no opacity or transform on it or its ancestors, font via next/font. The logo is inline SVG (not an LCP candidate) and nothing above the fold loads an image. Rows below the hero stream in after it.

## Hero "Calm night" (OTA-160, Pierce logo)
Two gradient blobs (violet `--brand-a`, teal `--accent`), a static dot grid, the floating Pierce logo with a moving sheen. CSS only, no new dependency, no WebGL.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Blob A (violet) | hero motion on | `transform: translate(120px, 60px) scale(1.12)`, alternate, infinite | 18 s `--ease-drift` |
| Blob B (teal) | hero motion on | `transform: translate(-140px, -40px) scale(0.92)`, alternate, infinite | 22 s `--ease-drift` |
| Logo float | hero motion on | `transform: translateY(-8px)`, alternate, infinite | 6 s `--ease-drift` |
| Logo sheen | hero motion on | `opacity` 0→1 of a second logo copy whose gradient is turned 180°, alternate, infinite | 9 s `--ease-drift` |
| Dot grid, h1, copy, search, CTAs | none | static | n/a |

`--ease-drift: cubic-bezier(0.45, 0, 0.55, 1)` is new (ambient loops only; the existing tokens are for UI responses). It lives in home.css for now; the build adds it to tokens.css with the other motion tokens.

**When it runs.** All four animations are declared `paused`. A tiny client island (about 0.5 kB, no library) sets `data-motion="on"` on the hero only when: `prefers-reduced-motion` is not `reduce`, `navigator.connection.saveData` is not true, the hero is in view (IntersectionObserver) and the document is visible (`visibilitychange`). It sets `off` again when any of these changes. Paused at frame 0 = the poster, so switching never jumps. `@media (prefers-reduced-motion: reduce)` also removes the animations in CSS, so it holds without JS.

**Poster state** (`mockup-Poster.html`): the same markup with motion off: blobs at rest, logo at its base position, sheen at opacity 0. Shown before hydration, with reduced motion, with Save-Data, with the tab hidden and with the hero scrolled away.

**Cost.** Two composited layers (`will-change: transform` on the blobs) and two SVG layers whose opacity/transform change; nothing repaints per frame. The blobs are radial gradients with an eased falloff instead of `filter: blur(110px)` (same look, no blur pass). The board's rotating SVG gradient (`animateTransform`, a repaint every frame) is replaced by the sheen cross-fade.

## Rest of the page
| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Anime card lift, add button reveal and press | hover, focus, `:active` | as in `../browse/motion.md` (reused) | `--dur-enter` / `--ease-enter` |
| Row skeleton shimmer | loading | `transform: translateX` of `::after` | 1.4 s `--ease-move` (browse) |
| XP bar, continue-watching progress | none | static width, no fill animation (above the fold, near LCP) | n/a |
| Rows | none | native horizontal scroll with `scroll-snap`, no auto-advance | n/a |
| Row arrows (‹ ›, section head) | click | `scrollBy({ left: ±clientWidth, behavior: 'smooth' })`; `behavior: 'auto'` (instant) under reduced motion | browser smooth scroll |

Reduced motion: no card lift or scale, static skeletons (browse rules), hero poster. Colour changes on hover stay.

## Behaviour
- Hero search is a plain `GET /search?q=` form (works without JS). Below 768 px the Search button is hidden; Enter / the keyboard's Go submits.
- Guest: CTA pair "Create your account" (`/auth?mode=sign-up`) and "I already have one" (`/auth?mode=sign-in`), plus a closing sign-up band before the footer.
- Signed in: the CTA pair becomes the XP card (greeting and username, level, XP bar with "N to level L+1" from the PARITY §5 level curve, season leaderboard rank, profile link); a "Continue watching" row (My List, status Watching, most recently updated first) comes first; the closing band is not rendered.
- Rows run to the viewport edge: the shell gutter is the scroller's padding and `scroll-padding-inline` (so snapping never pushes the first card past the heading), with a right-edge `mask-image` fade of `min(64px, gutter)` (capped at the gutter, so a fully scrolled last card is never faded) that shows there is more. The 44 px ‹ › buttons sit next to "See all" and show only at ≥ 1024 px with `(hover: hover)`; touch users swipe. ‹ is disabled at the start, › at the end, and both when the row doesn't overflow (`aria-controls` the list). This row change is shared in `../browse/browse.css`.
- Rows: Trending now (→ `/discover`), This season · {Season Year} (→ `/season`), Top rated (→ `/top/anime`), 8 cards each, the browse card unchanged. "This season" cards show format and episode count, no season (it is the row's title), or the Airing badge when the count is unknown; the mockup uses invented placeholder titles because no current-season fixtures exist. Continue watching cards replace the score/meta with "Ep n / total" and a progress bar; no add button (already in the list).
- No layout shift: every row slot (cards, skeleton, error, empty) has the same min-height (356 px, 316 px on mobile) and the XP card keeps one height across loaded, loading and failed (176 px, 232 px on mobile, where the two footer links always stack). Card meta is one line with an ellipsis (shared browse card) so rows never grow.
- Each row and the XP card is its own Suspense boundary: the hero copy, search and section heads render immediately (`mockup-Loading.html`).
- Errors (`mockup-Error.html`): a failed row shows the browse inline error with Retry and the rest of the page renders; failed XP shows an inline retry in the card's place. Empty: Continue watching ("Nothing in progress" + Browse this season), This season before announcements (link to the previous season).
- The home page does not render the shell's static `.sh-bg`; the hero sky replaces it.

## Accessibility check
- Contrast (computed, WCAG AA): `--muted` on ground 7.1:1 dark / 6.7:1 light; links and eyebrow `--accent-ink` 10:1 / 5.6:1; h1 gradient ends 6.9 and 10.4:1 dark, 6.2 and 4.7:1 light on the ground (large text, ≥ 3:1 needed, still ≥ 3.7:1 at the blob peaks); hero lede uses an ink/muted mix, ≥ 5.9:1 even at the blob peaks; badges Next 5.2 / 4.6, Lv 7.2 / 4.7, Later 6.0 / 5.9; podium gold 10 / 5.0.
- Focus: 2 px `--accent` outline with offset on the search field (`:focus-within`), CTAs, XP links, retry buttons, section links, feature links and the roadmap link; cards keep the browse focus style.
- Hit targets at 390 px: CTAs and the closing band buttons 48 px, row arrows 44 px (desktop only), search 52 px, XP links, roadmap link, retry and empty-state buttons 44 px; card add buttons and section links follow browse (44 px on mobile). Inline links inside feature text are exempt (inline).
- Not colour alone: score is a number, Airing / Upcoming / Next / Later are text badges, progress also reads "Ep 18 / 28", the XP bar has `role="progressbar"` with a text value and the numbers next to it.
- Structure: one `h1`; sections are `<section aria-labelledby>` with `h2`; cards are `h3`; the roadmap is an ordered list; the hero search is `role="search"` with a labelled input; the decorative sky and the sheen copy are `aria-hidden`, the logo has an accessible name; errors use `role="alert"`, skeleton rows `aria-busy`.
- Long content: card titles clamp to 2 lines (Slime Season 3), missing score or episode count are skipped (Minami-ke, One Piece), usernames up to the 20-character maximum fit the XP card with an ellipsis fallback.
