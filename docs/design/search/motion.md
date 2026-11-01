# Search and "did you mean" (OTA-96): behaviour, motion, accessibility

Mockups: `mockup-Main.html` (`/search?q=aot`: nickname query, every hit matched on a synonym), `mockup-Light.html` (`?q=titan`, two filters, sort by score, light theme), `mockup-DidYouMean.html` (`?q=freiren` auto-corrected, then no result and no suggestion), `mockup-UnknownSlug.html` (`/anime/shingeki-no-kyojn` 404 with close matches, then nothing close), `mockup-States.html` (no query yet, loading, error), `mockup-FilterSheet.html` (390 px phone frame, filters sheet open). Styles in `search.css` on top of tokens.css, components.css and `../global-shell/shell.css`. Screenshots in `shots/` (1440 and 390 px). Build ticket: OTA-98. The header search box and its suggestion popover are already designed in `../global-shell/` (OTA-151) and not repeated here.

## Direction
- Make one thing easy: type whatever you call the show (English, romaji, Japanese, "AoT") and land on it. Hierarchy: the field, then the results, then filters.
- One template with browse (OTA-154): same control bar, filter popovers / mobile sheet, active chips, count, card grid, list view, "Show more" and states. Only the big field, the match line, the did-you-mean notice and the 404 candidates are new.
- Memorable moment: the match line. When the query hit a title other than the one displayed, the card says which ("Also known as **AoT** S2"), so a nickname search never looks like a wrong result.
- Removed from the old `/search/anime`: draft vs applied filters (changes apply at once, like browse), tags, source material, age rating, adult toggle, min/max score and episodes (rare; the adult setting comes from the user's settings), infinite scroll (explicit "Show more"). The two mock search pages are gone.

## Behaviour
- **Route:** `/search?q=&format=&season=&year=&genre=&status=&sort=&view=&page=`. The URL is the whole state; a shared link reproduces the page. Server-rendered first page.
- **Field:** submit on Enter (no instant results on this page: the header popover already does instant suggestions, and re-rendering the grid per keystroke is noisy and costly). Any length ≥ 1 character is accepted here; the header popover keeps its 3-character minimum. Clear (×) empties the field and focuses it, results stay until the next submit. The header search box is hidden on `/search` (OTA-151 rule); `/` focuses this field.
- **Matching (API, OTA-98):** English, romaji, native and synonyms, case and accent insensitive, so "AoT", "SnK", "進撃" and "shingeki" all work. The API returns, per hit, the title that matched when it is not the display title; the card shows it on one line ("Also known as …", ellipsis, `<mark>` on the matched part). When the display title matched, the match is marked in the title instead and no extra line is shown.
- **Not imported yet:** search queries the source through its adapter, so anime missing from our database are found too. The card is identical; opening it imports on demand (OTA-92, the anime page's loading state covers the wait). No "not imported" badge: it is our implementation detail.
- **Sort:** Best match (default with a query), Popularity, Score, Newest, Oldest, Title A–Z. Anime with no score sort last under Score and show no badge.
- **Filters:** Format, Year & season, Genre, Status. Same semantics as browse: OR inside a filter, AND across, applied server-side so counts are right. Filters without a query are allowed (`/search?genre=Fantasy`): genre chips on the landing use that.
- **Did you mean (search):** when a query has zero results and the API has a close title (edit distance on titles and synonyms), the page shows that title's results under a notice: "Showing results for **frieren** · No anime matches “freiren”. Search for “freiren” only". The notice is `role="status"`. The escape link adds `exact=1` and shows the plain empty state. With filters on and zero results, no auto-correct: the empty state says which filters are on and offers "Clear filters" first.
- **Did you mean (unknown slug):** `/anime/<slug>` that resolves to nothing returns HTTP 404 (`notFound()`, `noindex`) and renders this page instead of the generic 404: the slug becomes a query (dashes to spaces), the top 3 hits are listed as candidates (English title, romaji, format, year; the whole row is the link), the field is prefilled, plus "This season" and "Home". Nothing close: same layout with only the field. Never auto-redirect: a wrong guess on a 404 is worse than one click.
- **Landing (no query):** field with a one-line hint, "Browse by genre" chips (each a filter-only search), and three list shortcuts (current season, Top rated, Upcoming). No recent searches in v1 (needs storage per viewer; not on the old site).
- **Loading:** after 150 ms, 6 skeleton cards in the grid, "Searching…" in the count line, `aria-busy` on the list; field and controls stay usable. "Show more" loading/failed states as in browse.
- **Error:** `ol-state--error`, `role="alert"`, "Search is unavailable right now", Retry; query and filters kept.

## Motion
| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Field focus ring and border | focus | `outline`, `border-color` | `--dur-press` / `--ease-enter` |
| Filter buttons, sort, view toggle | hover, press | `color`, `background-color`, `border-color` | `--dur-press` / `--ease-enter` |
| Card | hover, focus-visible | existing `.ol-anime-card` lift | existing tokens |
| 404 candidate row | hover | `border-color` | `--dur-enter` / `--ease-enter` |
| Filter popover (desktop), filter sheet (mobile) | open / close | browse pattern: popover `opacity` + `scale(.97→1)`, sheet `translateY(100%→0)` + scrim `opacity` | `--dur-enter` in, `--dur-exit` out |
| Results replaced after submit | new results | none: swap in place, focus stays in the field, count announced | n/a |
| Skeletons | loading | existing `.ol-skel` shimmer | 1.4 s |

Typing never animates anything (ADR 0011). No layout property is animated. `prefers-reduced-motion: reduce` removes the transitions and the shimmer (static skeleton).

## Accessibility check
- Contrast: body ink and `--muted` on `--surface` pass 4.5:1 in both themes (OTA-91 values, see overview-tab); `<mark>` uses `--accent-ink` (9.2:1 dark, 5.6:1 light) plus bold weight, so the match is not shown by colour alone. The did-you-mean link is underlined.
- Structure: `h1` "Search" (or the 404 title), the field is a `form role="search"` with a visible-to-AT label "Search anime"; result titles are `h2` in an `ul`; the count line is `aria-live="polite"` ("14 anime for “aot”", "Searching…"); active filter chips have "Remove" in their accessible name; filter buttons announce the number selected ("Format, 2 selected").
- Focus: 2 px `--accent` outline with offset on the field (`:focus-within`), filters, sort, view toggle, chips, links; a 404 candidate row outlines whole (`:has(:focus-visible)`). After "Show more", focus moves to the first new card. The mobile sheet is `role="dialog"` + `aria-modal`, focus trapped, Esc and × return focus to "Filters".
- Hit targets at 390 px: field 52 px, Filters and sort 44 px, sheet options 44 px, sheet buttons 48 px, landing chips 44 px, clear (×) 44 px, "Clear all" 44 px.
- Long content: titles clamp to 2 lines in the grid and wrap in 404 candidates; match line ellipsis; a long unknown slug breaks anywhere (`word-break: break-all`).
- Japanese queries and titles: the native title in candidates and match lines gets `lang="ja"` in the build.
