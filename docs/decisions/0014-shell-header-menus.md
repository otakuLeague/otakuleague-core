# 0014: Shell header and its menus (native disclosure, static shell)

Status: proposed (2026-11-11, OTA-152 slice 2). Narrows ADR 0012 for the header's two disclosures; accepted when the header PR merges.

## Context
OTA-152 slice 2 adds the global header from `docs/design/global-shell/` to the root layout. There is no auth until W4, most link targets (`/season`, `/top/anime`, `/search`, ...) do not exist yet, and the root layout must stay static (`cacheComponents: true`, ADR 0003).

**Functional.** Visitors should be able to (1) reach Discover (4 lists), Seasonal, Rankings and Leaderboard from any page and see which section they are in; (2) submit a search from the header (`GET /search?q=`, live results come with OTA-98); (3) sign in or sign up as a guest, and later reach My List, profile and settings as a member.

**Non-functional (quantified).**
1. With JavaScript off, 100 % of header links are reachable, both menus open and the search submits.
2. Shell client JS stays under 30 kB gzipped in total (header, later sheet and search); this slice adds no dependency.
3. The root layout stays static: no `cookies()`/`headers()`, and `next build` passes with `/anime/[slug]` (a param unknown at build time) below it.
4. Keyboard: Esc closes a menu and returns focus to its trigger, focus leaving closes it, 40 px targets, 2 px focus ring, text contrast ≥ 4.5:1 (existing tokens).
5. Motion: `transform`/`opacity` only, enter ≤ 200 ms (`--dur-enter`), no transform under reduced motion (ADR 0011).
6. Each PR stays near 400 lines without tests.

**Consistency vs availability:** availability. The header holds no shared data; it must render when the API is down and must never wait for it. When auth lands, the viewer is resolved outside the static shell, and a briefly stale signed-in state is acceptable.

**Entities:** `NavSection`, `NavLink`, `Disclosure`, `ShellViewer`.

## Options
1. **Native `<details>/<summary>` plus a small client enhancer** (chosen).
2. **Base UI `NavigationMenu`/`Menu`/`Popover`** (ADR 0012 default). Rejected for these two menus: nothing opens without JS (fails 1); `Menu` is an ARIA `menu`, which the design rules out because the account panel holds a heading and the theme radios; it spends a large part of the 30 kB budget before the sheet and the combobox, which need it more; and `package.json` is a protected path, so the PR could not automerge.
3. **Hand-rolled button + `hidden` panel, as in `season-selector.tsx`.** Rejected: same no-JS failure, and more state and listeners than option 1 for the same behaviour.
4. **HTML `popover` attribute.** Rejected: needs CSS anchor positioning to sit under its trigger, jsdom cannot test it, and it still needs JS to close on a soft navigation.

## Decision
```
app/layout.tsx
└─ SiteHeader (server)                    src/shell/site-header.tsx
   ├─ Logo (server, exists)
   ├─ Suspense fallback=<HeaderNavView pathname={null}/>
   │  └─ HeaderNav (client: usePathname)  src/shell/header-nav.tsx
   │     └─ HeaderNavView({ pathname })   pure view: links + active state
   │        └─ Disclosure "Discover"      src/shell/disclosure.tsx (client)
   ├─ <form role="search" action="/search" method="get"> input name="q" (server)
   └─ actions by viewer: guest → Sign in, Sign up; member → My List, Disclosure "Account menu" (slice 2b)
```
- **Component API.** `Disclosure({ summary, summaryClassName, summaryLabel?, active?, align?: 'start' | 'end', children })` renders `<details name="sh-menu" class="sh-has-pop">`, a `<summary>` and the panel (`.sh-pop.sh-menu.ol-glass`). The element is uncontrolled: the browser opens and closes it, React holds no `open` state, and the enhancer only ever closes it (Esc + refocus the summary, pointer down outside, focus moving outside, click on a link inside, so a soft navigation does not leave it open). `name` makes the two menus exclusive without JS.
- **Active section** is a pure function in `src/shell/nav.ts`: `activeSection(pathname: string | null): NavSection | null`, matching whole path segments (`/season` and `/season/2026`, not `/seasonality`). Links get `aria-current="page"`; the Discover summary gets `data-active` and the current item inside it gets `aria-current`.
- **Viewer** (slice 2b, `src/shell/shell-viewer.ts`): `type ShellViewer = { kind: 'guest' } | { kind: 'member'; username: string }`, passed as a prop from the layout (`guest` until W4). Level and XP join the member variant when the XP module exists. No sign-out button before auth.
- **Styles** go in `app/styles/shell.css` (ported from the design's header, nav, search, popover and menu blocks; `[aria-expanded='true']` selectors become `details[open] > summary`). Enter animation is a keyframe on `details[open] > .sh-pop`.
- **Simplest first.** Slice 2a is the guest header on desktop. Below 768 px it shows the logo and Sign in only, until the sheet slice.

### Deep dives (only the requirements above)
- **No JS (1).** Everything is an `<a>` or a native form; `<details>` gives open/close, expanded state for assistive tech and Enter/Space for free. Verified: jsdom 30 toggles `open` on a summary click, so tests can drive it; it does not implement `name` exclusivity, so that is not unit-tested.
- **Static shell (3).** `usePathname` suspends during prerender when a param is unknown at build time, and the build fails without a boundary (Next 16 docs, `use-pathname`, "Cache Components"). Hence the `Suspense` whose fallback is the same nav with nothing active: the static shell always contains working links.
- **Sticky header (4).** Verified in headless Chrome: with today's `html, body { overflow-x: hidden }` in `globals.css` a `position: sticky` header scrolls away (body becomes the scroll container); `overflow-x: clip` fixes it. The anime sticky bar is `position: fixed; top: 0; z-index: 10` and would sit under the header: it moves to `top: var(--header-h)` (hidden state translated by the header height too) and `scroll-padding-top` gains `--header-h`.
- **Budget (2).** Own code only, estimated 1 to 2 kB gzipped (not measured). The builder gzips the emitted chunk and puts the number in the PR.

## Consequences
- ADR 0012 still decides the mobile sheet (Base UI `Dialog`: focus trap) and the search combobox (OTA-98). Rule of thumb: a list of links that opens in place is `<details>`; anything that traps focus or is an ARIA composite widget is Base UI.
- Accepted gaps against `motion.md`: closing is instant (no 150 ms fade), no ↑/↓ between items, the trigger is a `<summary>` rather than a `button[aria-expanded]`. A fade through `::details-content` can be added later as progressive enhancement.
- Too simple? Three failure modes were found and are covered above: the sticky header not sticking, the anime sticky bar collision, the prerender failure. One is left open on purpose: phones have no nav between this slice and the sheet slice (the site had no header at all before, beta is noindex).
- Too complicated? No: two client files, no state, no dependency. The `Suspense` boundary is the only non-obvious part and is forced by requirement 3.
- Not checked here: `summary` as an inline-flex container in Safari (wrap its content in a `span` if the chevron misaligns), and whether `instant = false` on the anime segment would have exempted the root layout from the `Suspense` requirement.
- Later: the search box is shown on every page until `/` and `/search` have their own field; then pages mark themselves and CSS hides it (`body:has([data-own-search]) .sh-search`), with no pathname logic.

- Most link targets (`/discover/*`, `/season`, `/top/anime`, `/leaderboard`, `/search`, `/auth`) 404 until their tickets land; those links use `prefetch={false}` so production does not prefetch 404s. Accepted because beta is noindex and pre-launch.
- Between 768 and 1100 px (`--bp-lg`) the header search box is hidden and gaps shrink so Sign in / Sign up stay on screen; the search page link returns with the mobile sheet slice.

## Learnings
- A web build without the `Suspense` boundary also passed here (probably `instant = false` on the anime segment); the boundary stays as cheap insurance for future dynamic routes.
- A `backdrop-filter` parent is the backdrop root for nested glass, so the Discover panel uses a solid surface instead of `.ol-glass`.
- The design's container-query widths did not survive a single 768 px breakpoint: measure the header at 768/820/1024 with Playwright after any nav change.
