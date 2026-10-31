# Global shell: behaviour, motion and accessibility (OTA-151)

Mockups: `mockup-Main.html` (signed in, Discover open), `mockup-Guest.html` (guest, header search open), `mockup-Light.html` (light theme, account menu open), `mockup-Mobile.html` (390 px frames: header, sheet, full-screen search), `mockup-States.html` (404, 500, search states). Styles in `shell.css`, built only on `tokens.css` + `components.css`. Screenshots in `shots/`. Build ticket: OTA-152.

## Structure
- **Header** (64 px, sticky, `.ol-glass`): logo · Discover ▾ · Seasonal · Rankings · Leaderboard · search box · (guest) Sign in, Sign up / (signed in) My List, avatar. The old "Search" nav link is gone: the search box is the entry, and "All results for …" / "Advanced search" lead to `/search`.
- **Search box hidden** on `/`, `/search` and the 404 page, which have their own field (old site hid it on `/` and `/search`).
- **Shell skipped** on `/auth*` and `/onboarding`, as before.
- **< 768 px:** nav and search box collapse into a search icon button (opens the full-screen search) and a menu button (opens the sheet). Guests keep "Sign in" visible; "Sign up" moves into the sheet.
- **Footer:** brand + tagline, OtakuLeague (Roadmap ↗, About & FAQ, Contact), Legal (Privacy, Terms, Cookies; pages from OTA-147), Follow (X, Discord, Instagram, TikTok, Facebook, with accessible names), Theme, contact email and AniList attribution. Social placeholders are letters; the build uses each network's official icon.
- **Theme** (new): System / Light / Dark radio group in the account menu, the mobile sheet and the footer (all three show the same value). Default System; stored in a cookie so the server renders the right theme with no flash. Sets `data-theme` on `<html>`; System removes it and `tokens.css` follows `prefers-color-scheme`.

## Active section and focus order
- Active section by path prefix: `/discover*` → Discover, `/season*` → Seasonal, `/top*` → Rankings, `/leaderboard*` → Leaderboard. Shown with ink colour + 600 weight + a 2 px accent underline (never colour alone) and `aria-current="page"`. In the sheet: tinted row + 3 px inset bar.
- Tab order: Skip to content → logo → Discover → Seasonal → Rankings → Leaderboard → search → My List → avatar (guest: Sign in → Sign up). `/` focuses the search box from anywhere outside a text field.
- Discover and account menus: disclosure buttons (`aria-expanded`); ↓ / Enter / Space open and focus the first item, ↑ ↓ move, Esc closes and returns focus to the button, Tab leaves and closes. Clicking outside closes.
- Header search: combobox + listbox (`aria-activedescendant`), ↑ ↓ move, Enter opens the selected anime (or `/search?q=` when none is selected), Esc clears then closes. Min 3 characters, max 8 results, 250 ms debounce, results announced through a polite live region ("5 results").
- Sheet and full-screen search: `role="dialog"` + `aria-modal`, focus trapped, Esc / close button return focus to the trigger, page scroll locked.

## Motion (tokens from `docs/design/system-v2/motion.md`)
| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Discover, account menu, suggestions | open | `opacity` 0→1, `transform: scale(0.97)`→1 from the trigger corner | `--dur-enter` / `--ease-enter` |
| Same | close | `opacity` → 0 | `--dur-exit` / `--ease-exit` |
| Menu chevron | open / close | `transform: rotate(180deg)` | `--dur-move` / `--ease-move` |
| Nav link, menu row | hover / press | `color`, `background-color` | `--dur-press` / `--ease-enter` |
| Mobile sheet | open / close | `transform: translateX(100%)`→0 | `--dur-move` / `--ease-move` (close: `--dur-exit`) |
| Suggestion rows | results arrive | none (typing is high-frequency, ADR 0011) | — |
| Search skeleton | request > 150 ms | appears; no shimmer | — |

- Header glass never animates its blur; it's the one glass surface besides an open menu (two at most on screen).
- Reduced motion: no `transform` (scale, rotate, slide); menus and sheet use the opacity fade only.

## Background
Replaces the old animated orbs, grid, lines and vignette: two static radial gradients (brand purple top-left, cyan top-right) and a 48 px grid masked to fade out, in one absolutely positioned layer 720 px tall behind the page. No animation, no `filter: blur`, painted once, scrolls away with the content. Lighter (55 % opacity) in the light theme. The home hero brand moment (OTA-160) sits on top of it.

## 404 and 500
- `app/not-found.tsx`: full shell, "404" in the brand gradient, search field (header search hidden), "This season" + "Home".
- `app/error.tsx`: full shell, "Try again" (calls `reset()`), "Home", and the request id (`requestId` from the API error, ADR 0004) so a bug report can be traced. `app/global-error.tsx` (the layout itself failed) shows the same block without the shell.
- Search popover states: under 3 characters, loading (skeleton rows after 150 ms), nothing found (with "did you mean" from OTA-98 when available), error with Retry.

## Accessibility check
- Text contrast ≥ 4.5:1 on both themes, including on the glass header over the brightest part of the background (tint 72 %). `--muted` on `--surface` and `--accent-ink` links checked in both themes (OTA-91 values).
- Hit targets: 44 px icon buttons, menu rows, sheet rows and footer links below 768 px.
- Visible focus: 2 px accent outline, 2 px offset, on every interactive element.
- Long usernames (30 chars) truncate with an ellipsis in the account menu; the full name is in the profile link's accessible name. Long anime titles truncate to one line in suggestions.
