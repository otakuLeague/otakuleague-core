# Browse pages: behaviour, motion and accessibility (OTA-154)

Mockups: `mockup-Seasonal.html`, `mockup-Rankings.html`, `mockup-Discover.html`, `mockup-DiscoverList-Light.html`, `mockup-States.html`; styles in `browse.css` (on top of tokens.css, components.css and `../global-shell/shell.css`); screenshots in `shots/` (1440 and 390 px). Build tickets: OTA-137 (pages), OTA-136 (home carousels reuse the card and section row), OTA-142 (add-to-list button).

## One template, three entry points
| Route | Heading control | Default sort | Default view |
| --- | --- | --- | --- |
| `/season?season=fall&year=2026` | Season stepper: ‹ prev, season selector (`.ol-season`), next › | Popular | Grid |
| `/top/anime` | Score / Popularity toggle (rank by) | Score | List with rank numbers |
| `/discover` | Genre shortcuts + 4 sections (Top airing, Top upcoming, Latest episodes, Recently completed), 8 cards each, "See all →" | n/a | Row of cards |
| `/discover/{airing,upcoming,completed,episodes}` | Segmented switch between the four lists | List-defined (PARITY §2) | Grid |

Every list page shares: page head, control bar (sort or rank-by, Format / Genre / Status filters, Year on Rankings, Grid / List toggle), active filter chips with "Clear all" and a server-provided total ("38 anime"), the results, and "Show more".

## Filters (server-side, URL is the state)
- All filters, sort, view and page live in the query string (`?format=TV&format=ONA&genre=Fantasy&sort=score&view=list&page=2`); a shared link reproduces the page. No localStorage (the old site kept per-page filters there).
- The API filters and paginates (OTA-135), so counts and ranks are right with multi-select. Within one filter values are OR (TV or ONA); across filters AND. Genre "match all" from the old Seasonal page is dropped for v1 (rarely used; adds a mode toggle).
- Rank numbers on Rankings are the anime's global rank from the API, not its position in the filtered list, so "Fantasy" shows ranks like 1, 6, 7. The rank is the same one shown on the anime page.
- Desktop: each filter button opens a popover (disclosure pattern, checkboxes, "Apply" not needed: each change updates the URL with `router.replace`, debounced 300 ms for the score/year ranges). Mobile: one "Filters (n)" button opens a bottom sheet with the same groups and a "Show 38 anime" button.
- Old-site extras dropped from v1: text search inside lists (the header search covers it), min/max episodes, min/max score, the trailer modal. Kept: format, genre, status, year (Rankings), season and year (Seasonal), sort.

## Anime card
- Grid variant: fluid width (`minmax(176px, 1fr)`; 2 columns at 390 px), 2:3 cover, score badge top left (none when the anime has no score yet), Airing / Upcoming badge bottom left, title clamped to 2 lines, meta "Format · N eps · Season Year" (missing parts are skipped, never "? eps").
- List variant: rank, 56 px thumb, title on one line with ellipsis, meta, up to 3 genre chips, score, members, add button. The whole row is a stretched link; the add button sits above it. At 390 px: rank, thumb, title + "★ 9.1 · TV · 2023", add button.
- Quick add-to-list ("+") is a sibling `<button>` of the card link, never nested inside it, labelled "Add <title> to My List". Guests get the sign-in prompt (OTA-142). On hover-capable devices it appears on hover/focus-within; on touch it is always visible (`@media (hover: none)`).
- Card accent: `--card-accent` from the cover colour drives the hover outline and glow (existing `.ol-anime-card`).

## Motion
| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Card cover lift | hover, focus-visible | `transform: translateY(-2px)`, outline, shadow | `--dur-enter` / `--ease-enter` (existing) |
| Add button reveal | card hover / focus-within | `opacity` 0→1, `transform: scale(.9→1)` | `--dur-enter` / `--ease-enter` |
| Add button press | `:active` | `transform: scale(.94)` | instant in, `--dur-enter` out |
| Segmented toggles, filter buttons | click | `color`, `background-color` | `--dur-press` / `--ease-enter` |
| Row hover border | hover / focus-within | `border-color` | `--dur-enter` |
| Skeleton shimmer | loading | `background-position` (small elements only) | 1.4 s linear, infinite |
| New page of results | "Show more" | none: cards appear in place, focus moves to the first new card | n/a |

No layout properties are animated; no auto-advancing carousel (the old SpotlightCarousel and its 1 s countdown are gone). Discover rows scroll natively with `scroll-snap`; no JS arrows on touch, arrow buttons on desktop are optional for the build.
Reduced motion: no lift, no scale, no shimmer (static skeleton); colour and opacity changes stay.

## States (mockup-States.html)
- Loading: skeleton grid for the first page; the head and control bar render from the URL so they stay usable. "Show more" shows a spinner label and `aria-busy` on the list.
- Empty, filters: "No anime match these filters" with "Clear filters" and a nearby season. Empty, season not announced: explains and links back to the current season.
- Error: whole list failed → retry card (`role="alert"`), filters kept. One Discover section failed → inline error with Retry, other sections render. "Show more" failed → first page stays, button becomes "Retry loading more".

## Accessibility check
- Text contrast (WCAG AA): `--muted` on surface 6.6:1 (dark) / 6.7:1 (light); `--accent-ink` links 10:1 / 5.6:1. Rank numbers use `--faint` (3.9:1 dark, 4.2:1 light) only at ≥ 20 px bold (large text, ≥ 3:1) and carry `aria-label="Rank n"`.
- Focus: every control has a 2 px `--accent` outline; card focus uses the existing cover outline.
- Hit targets at 390 px: filter, stepper, segmented and add buttons ≥ 44 px (segment items 38 px tall inside a 44 px group); genre chips 44 px.
- Not colour alone: score bands also show the number; Airing / Upcoming are text badges; the active sort is `aria-current`/`aria-pressed` plus a filled segment.
- Structure: one `h1` per page, Discover sections are `<section aria-labelledby>`, Rankings is an `<ol>`, the result count is `aria-live="polite"`, the four Discover lists switch is a `nav`.
- Long titles: clamp to 2 lines (grid) or ellipsis (list), full title in the link text; the worst case (Slime Season 3 subtitle) is in every mockup.
