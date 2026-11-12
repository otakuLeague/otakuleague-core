# My List design (OTA-156)

Mockups for `/my-list` and the add-to-list control, built by OTA-142. Open the `mockup-*.html` files in a browser (static, no JS); screenshots at 1440 and 390 px are in `shots/`. Motion and reduced-motion behaviour: `motion.md`. Shared styles: `my-list.css` on top of `tokens.css`, `components.css`, `../global-shell/shell.css` and `../browse/browse.css` (the guest frame also links `../auth/auth.css`).

| File | Shows |
| --- | --- |
| `mockup-Main.html` | Grid view, All tab, search, sort, view toggle, pager; hover actions; a failed +1 |
| `mockup-Table.html` | Table view, sortable headers, inline status/progress/score/favourite, a failed score save; phones get list rows |
| `mockup-Mobile.html` | Three 390 px frames: list rows, grid with search (match counts in tabs), edit sheet |
| `mockup-Light.html` | Light theme, Watching tab, table and grid |
| `mockup-AddControl.html` | Control on the anime header (not in list, in list, popover, XP moment, save failed, removed, guest) and on a card (quick menu, in list, XP moment), phone sheet |
| `mockup-States.html` | Loading, empty-list onboarding, empty tab, no results, load error, next page failed, session expired, worst-case content, MAL import dialog, guest |

## Direction
- Make "what am I watching, and what's next" one glance and one tap: progress and +1 sit on every card and row.
- Hierarchy: status tabs with counts → search/sort/view → entries (cover, title, progress, your score, favourite).
- The memorable moment: finishing a show (gold "+XP" chip rising from the control, level bar filling in a toast). Nothing else celebrates.
- Removed: the drag-and-drop board, the silent empty-on-error state, the always-loaded full list.

## Decisions
- **Board dropped.** The old kanban (dnd-kit) is replaced by status tabs that keep every status visible with its count (including 0, like the old empty columns). Reasons: at 1,000 entries a Completed column of 700 cards is unusable; drag is weak on touch and needs a full keyboard alternative anyway; status is now one tap from every card and row; it saves a dependency. Parity "Board/Table/Cards" becomes Grid (cards) / Table, with tabs doing the board's grouping. Open question 1.
- **Views**: Grid and Table on desktop; on phones Table becomes "List" rows (cover, title, status, progress, +1, edit). The choice lives in the URL (`?view=`).
- **Tabs are links** (`?status=all|favourites|watching|...`), server-rendered, `aria-current="page"`; not an ARIA tablist (the panel is the same list, filtered). Default tab: All, sorted by recently updated (parity).
- **Search** is server-side over English, romaji and native titles, debounced 250 ms, inside the current tab; while searching, tab counts show matches per status so a hit in another tab is visible. Sort options (parity): recently updated, title A–Z / Z–A, score high–low / low–high; table headers Title, Score, Updated set the same sort.
- **1,000 entries**: `GET /me/list?status&q&sort&cursor` paginated, page size 60 (max 100), cursor based; counts and totals from one summary call (`GET /me/list/summary`) so tabs are right without loading everything. First page server-rendered; next pages load on scroll (IntersectionObserver) with a "Load 60 more" link as fallback (`?cursor=`, works without JS). No virtualisation library: CSS `content-visibility: auto` on cards/rows (and one `<tbody>` per page) keeps 1,000 loaded entries cheap (left out of the mockup CSS because full-page screenshots would show skipped entries as blank); revisit only if a mid-range phone recording says otherwise. Sorting and the display rule run in the API, so pages never reshuffle client-side.
- **Display rule** (watched ≥ total shows Completed, except Rewatch) is computed in the API as the entry's displayed status, so counts, tabs, search and sort agree (Oshi no Ko and Solo Leveling in the mockups).
- **Unknown episode totals** show "47 / ?", no progress bar, +1 never disabled. Known totals clamp: + is disabled at the total, − at 0.
- **Add control, header**: one split button. Main part adds as Plan to watch; chevron adds with another status; heart adds as Plan to watch + favourite. In the list it becomes "Status · 27 / 28 ▾" + "+1 ep" + heart; the status button opens the edit popover (status, episodes with "Mark all watched", score 1–10 with Clear, favourite, rewatch count for Completed/Rewatch, Remove). Autosave on every change, footer says Saved / Saving… / Not saved.
- **Add control, card**: the browse card's + opens a quick menu (radio statuses, "Edit episodes, score…", Remove when in list); once in the list the + shows the status dot. On phones the popover is a bottom sheet.
- **XP moment**: shown only when the server's response carries points (keys from PARITY: `list.add`, `list.mark_watching`, `list.mark_completed`, `list.mark_dropped`, `list.rate`). Small gold chip for every award; the toast with the level bar only for Completed. Never for a plain +1, never "0 XP" (cap or cooldown), merged within 2 s. Point values in the mockups (+40) are placeholders; the server owns them.
- **Remove** (new, the old site had none): in the popover, the card menu and the row ⋯ menu. No confirm dialog; an Undo toast for 8 s restores status, progress, score, favourite and rewatches. Does not refund XP (open question 2).
- **Errors are visible**: load failure = error state with Retry and error code; failed write = optimistic value rolled back with an inline message and Retry next to the entry (card, row, popover); next page failure = inline error, loaded entries stay; 401 on a write = sign-in prompt, change replayed once after sign-in.
- **Guest**: `/my-list` redirects to `/auth?mode=sign-in&next=/my-list` (auth design OTA-155 replaces the old RequireAuth wall); the add control, heart and card + open the auth sign-in prompt and keep the pending add.
- **MAL import**: "Import from MAL" in the page header and the empty state; opens the `.xml` dialog (5 MB limit, imports earn no XP), same component as /settings/import-export.
- **Adult content (note only, no UI)**: entries with AniList `isAdult` / genre Hentai are filtered by the API unless the account is 18+ with "allow adult content"; counts, search and pages already exclude them.
- **Empty list**: onboarding panel (three steps, Browse + Import) plus a "Popular right now" row with quick-add cards; tabs, search and sort are hidden until the first entry.
- Liberties: header totals (anime, episodes watched, favourites) from the summary call; per-status colour dots; "Mark all N watched" shortcut; rewatch count shown as "Rewatch ×2".

## Worst-case content (break-ui)
Tested: 120-character romaji title, full-width + Japanese title, single-letter "K", 1,284 episodes with no total, 1,122 / ?, rewatch ×14, score 1 and 10, missing score, favourite + score + progress on one meta line, failed save on a row. Fixes applied in the mockups: titles clamp to 2 lines with `overflow-wrap: anywhere` and a reserved 2-line height so card rows align; numbers never truncate (tabular mono); card hover actions sit in a cover-sized overlay so they never cover the meta line; tabs `nowrap` (no "PLAN TO / WATCH" wrap on phones); the 7-column table becomes list rows below 768 px. Known and accepted: on a phone row the heart wraps to its own line when score and a 4-digit progress are present.

## Accessibility check
- Contrast (computed, sRGB approximation of the oklab mixes): status tones on their 12% tinted fill 5.4–8.5:1 dark, 4.9–6.1:1 light; chips on cover art use a solid dark backing (≥ 4.6:1 even on white art); muted text 6.6:1 dark / 7.3:1 light; ink on XP gold 11.9:1; error text on the error row 6.2:1. The build adds the `--ls-*` tones to `tokens.css` and `CHIP_TOKENS` in `tokens.test.ts`.
- Focus: every control has a 2 px accent outline with offset; card focus ring moves to the cover.
- Targets: 44 px on phones (tabs, search, sort, view toggle, +1, ⋯, sheet options, score buttons, Remove); desktop table steppers are 32 px (pointer: fine).
- Not by colour alone: every status chip, dot and tab carries its label; favourite is an icon with "Favourite" text for screen readers and `aria-pressed`; errors have text and an icon.
- Semantics: native `<table>` with `aria-sort`; steppers are groups with labelled buttons; status and score pickers are radio groups; save state and XP toast are `role="status"`, errors `role="alert"`; the XP chip is `aria-hidden`.
- Reduced motion: stated in `motion.md` (fades only, level bar jumps).

## Build notes for OTA-142
- API (new module or extension): `GET /me/list` (cursor, `limit` ≤ 100, `status`, `q`, `sort`), `GET /me/list/summary` (counts per displayed status + favourites + totals, same `q`), `PUT /me/list/:animeId` (partial: status, progress, score 1–10 or null, favourite, rewatches; validated and clamped server-side, returns the entry and any XP award), `DELETE /me/list/:animeId` and restore for Undo. Current user from the token. Error envelope codes (e.g. `LIST_UNAVAILABLE`, `LIST_ENTRY_NOT_FOUND`).
- Web: page is a server component reading search params; client islands only for the add control (Base UI Popover/Dialog/Menu), steppers and favourite (optimistic, `ApiResult` errors rendered inline), search input (debounced URL update) and the infinite loader. All calls through `apiClient()`.
- Add Sonner (toasts) and Motion in the first PR that needs them, with license and gzipped size (ADR 0012). No dnd-kit.
- Component tests: loading, empty list, empty tab, no results, load error, page error, failed write rollback, long titles, unknown total, display rule, guest redirect.

## Open questions for Farouk
1. Is dropping the drag-and-drop board OK (tabs + one-tap status instead), or should a Board view come back later as a desktop-only extra?
2. Should removing an entry take back the XP it earned (anti add/remove farming), or do server caps cover it?
3. XP point values per action are unknown (PARITY 5): what should add, watching, completed, dropped and rate give, and is +1 episode ever worth XP?
