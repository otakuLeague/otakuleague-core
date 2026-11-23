# Error pages with a mascot (OTA-212)

Mockups for the four error pages, all with one original OtakuLeague mascot. Styles: `errors.css` on top of `tokens.css`, `components.css` and `../global-shell/shell.css`. Motion: `motion.md`. Screenshots (1440 and 390 px): `shots/`.

## Direction
- Make the way out obvious: one plain sentence on what happened, then Home plus the one action that helps (search, Try again).
- Hierarchy: art → small code eyebrow (`404 · Page not found`) → playful headline → plain sentence → actions. The art replaces global-shell's big gradient "404" numeral; the code stays as a small mono label.
- Memorable moment: the mascot, a gradient tile with an antenna spark (the logo mark come alive), in a different pose per page. It floats slowly; nothing else moves.
- Removed: the bare unstyled pages, the "?" / "…" glyph marks of `ol-state`, and the "This season" primary button on 404 (Home is primary; browse is secondary).

## States
| Mockup | Page | Mascot pose | Headline | Actions |
| --- | --- | --- | --- | --- |
| `mockup-NotFound.html` | 404, unknown URL (guest) | Lost: map with a dashed route, "?" | This page wandered off | search field, **Go home**, Browse this season |
| `mockup-AnimeNotFound.html` | `/anime/<bad-slug>` (signed in, worst-case long slug) | Searching: magnifier over one eye, footprints | We searched every shelf | search field prefilled from the slug + **Search**, Go home |
| `mockup-Error.html` | `error.tsx` (signed in, full shell) | Confused: spiral eyes, sparks orbiting | Something tripped us up | **Try again**, Go home, reference line (digest) |
| `mockup-GlobalError.html` | `global-error.tsx` (no layout; follows the system theme) | Confused | Something tripped us up | **Try again**, Go home |
| `mockup-RateLimit.html` | 429 import busy, retry time known (top) / unknown (bottom) | Sleepy: eyes closed, z's, hourglass | Taking a short breather | **Try again**, Go home |
| `mockup-Light.html` | the four pages in the light theme | | | |
| `mockup-Slot.html` | art slot spec + all poses, dark and light, + a commissioned-art placeholder in the same block | | | |

429 copy: known → "Try again in about 40 seconds." (Retry-After rounded: under 60 s to the nearest 10 s, else "about N minutes"); unknown → "Try again in a minute or two." The button is always enabled (a disabled button hides why); no live countdown (no per-second screen-reader noise, no ticking motion).

## Art slot (the replaceable block)
- One element per page: `<div class="err-art" aria-hidden="true">` holding the SVG (or later an `<img alt="">`). Nothing outside it depends on the drawing.
- Aspect ratio **1:1**. Size **200 × 200 CSS px** at ≥ 768 px, **160 × 160** below. `flex: none`, so text never reflows when the art changes.
- Drawing area: viewBox `0 0 200 200`, **12 px safe area** inside the edges, ground (shadow) line at y ≈ 184. The float motion is on the slot, so it applies to any art.
- Decorative: `aria-hidden="true"` (or `alt=""`), `focusable="false"`; the headline and sentence carry the meaning.

## Art brief (for a commissioned version)
- **Character:** a small, friendly, rounded-square creature (corners ~35 % of its width), slightly taller than wide, with two oval eyes, a tiny mouth, pink cheek dots, two short stubby arms, two pill-shaped feet, and one thin curved antenna ending in a four-point spark. No ears, no tail, no face screen or visor, no floating orb, no letters on the body. Must not resemble any existing anime character, game or brand mascot (ADR 0006); the artist confirms the work is original and assigns the rights.
- **Colours:** body is a diagonal gradient from brand purple (top-left) to brand cyan (bottom-right); eyes and mouth in the page background colour; spark in mint accent; props in neutral greys. Dark theme: `#a78bfa → #22d3ee`, eyes `#12101a`, spark `#4fd1b5`, cheeks `#ff6fae`. Light theme: `#6d28d9 → #0e7490`, eyes `#f3efe6`, cheeks `#b3246a`. Preferred: one SVG per pose using `currentColor`/CSS variables so one file serves both themes; otherwise one file per theme.
- **Poses (4):** lost (holding a map, looking up, "?"), searching (magnifier over one eye), confused (spiral eyes, sparks circling the head), sleepy (eyes closed, "z", beside an hourglass). Same proportions and line weight in all four; flat shapes, no outlines thicker than 4 px at 200 px.
- **Format:** SVG, viewBox `0 0 200 200`, transparent background, no embedded raster, under 8 KB each, inside the 12 px safe area, feet on y ≈ 184. Fallback: PNG 600 × 600 (3x), transparent.

## Build notes (current files)
- **404** → `apps/web/app/not-found.tsx`: full shell, header search hidden (global-shell rule), page search field (`/` focuses it), Go home, Browse this season (`/season`).
- **Anime not found** → `apps/web/src/anime/not-found-view.tsx`, rendered by `apps/web/app/anime/[slug]/not-found.tsx` and `apps/web/app/anime-not-found/not-found.tsx` (the proxy rewrite target; `page.tsx` only calls `notFound()`). Replace the `ol-state` block with this page. The field is prefilled from the slug (hyphens → spaces), submits to `/search?q=`. The bad slug is shown in mono and wraps anywhere. The view needs the slug: the rewrite target only sees `/anime-not-found`, so prefill only where the slug is known (the `[slug]` route) and show an empty field otherwise.
- **Error** → `apps/web/app/error.tsx` (client component): Try again calls `retry`, Go home is a `Link`. Reference line shows `error.digest` when present, omitted otherwise; never the message.
- **Global error** → `apps/web/app/global-error.tsx`: renders without the root layout, so the mascot SVG and the few tokens it needs are inline (see `mockup-GlobalError.html`): no `next/font`, no image request, no imports beyond what it has. Theme follows `prefers-color-scheme` only. Add the Go home link (plain `<a href="/">`, a full reload is the point).
- **429** → `ImportBusyState` in `apps/web/app/anime/[slug]/header.tsx` (the `api_error` 429 branch): this block replaces the `HeaderState`. Pass the retry time if the API result carries one; else the unknown copy. Try again re-requests the page (`router.refresh()`).
- **Mascot component:** one server component `ErrorArt({ pose })` with the four inline SVGs and the `.m-*` classes from `errors.css`; gradient ids must be unique per render (`useId`). Pose strings: `lost | searching | confused | sleepy`.
- Every page keeps one `h1`, `main#main` as the skip-link target, and its `metadata.title` as today.

## Decisions
- Art replaces the giant "404" numeral; the code survives as a small eyebrow so it is still searchable and readable.
- Home is the primary action on 404 (the ticket's way out); search is the primary on anime-not-found, Try again on errors.
- Copy keeps "This page wandered off" for 404; other headlines are new. Each sentence says what happened in plain words.
- Global error is dependency-free and follows the system theme only (the theme cookie is not read there).
- Float over blink: it survives a commissioned image and needs no SVG part animation.
- Arms are a darker mix of the brand colours so they read against the body in both themes.

## Accessibility check
- Text contrast (WCAG): dark ink 15.7, muted 7.1, accent-ink link 10.0; light ink 14.5, muted 6.7, accent-ink 5.6; button text on accent 10.0, secondary buttons ≥ 12.9. All ≥ 4.5:1. The mascot is decorative; no meaning is carried by colour or art.
- Focus: `.ol-btn` 2 px accent outline + 2 px offset; search field `:focus-within` ring; reference link gets the same outline.
- Targets: below 768 px every button and the search field are full width and 44 px tall. The inline "contact us" link in the reference sentence is exempt (inline text, WCAG 2.5.8).
- Reduced motion: the float is off (`prefers-reduced-motion: no-preference` gate); nothing else animates.

## Open questions for Farouk
1. Name for the mascot (working name "Tilo", not shown in the UI)? It could later appear elsewhere (empty states, onboarding).
2. Does the import 429 send `Retry-After`? If not, should the API add it so the known-time copy can be used?
3. Commission an artist for the final art, or ship this geometric version as v1?
