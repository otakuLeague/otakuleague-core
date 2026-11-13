# Leaderboard design (OTA-157)

Mockups for `/leaderboard?season=&q=&page=`. Styles: `leaderboard.css` on top of `../profile/profile.css` (avatar, level plate, meter, focus rings, phone frames), the shell and the tokens. Screenshots at 1440 and 390 px in `shots/`; motion in `motion.md`. Profile, XP and level-up: `../profile/`.

| File | Shows |
| --- | --- |
| `mockup-Main.html` | Live season (Spring 2027): header, season switcher, player search, podium, ranks 4–13 (of 4–53), pager, your-rank bar |
| `mockup-Mobile.html` | 390 px: main with your-rank bar, season switcher open, search "kaze", light theme |
| `mockup-States.html` | Your own page (row highlighted with "You", bar hidden), empty season (day 1, unranked user), past season header (Final), loading, load error, no search match, guest bar |

## Direction
- Make "who is winning this season, and where am I" one glance: podium, then the ranked list, with your rank always one bar away.
- Hierarchy: title + season status (Live, days left, players) → season switcher and search → podium (2nd, 1st, 3rd) → table (rank, player, level, season XP) → pager → your-rank bar.
- Memorable moment: the podium (angled plinths in medal tones, crown on #1). The list stays calm and dense.
- Removed: the whole-table client download and client-side search (PARITY 7: 1,000-row cap, no caching); search and paging run in the API.

## Decisions
- **Per season** (Farouk, 2026-11-12): seasons follow anime quarters (Winter Jan–Mar, Spring Apr–Jun, Summer Jul–Sep, Fall Oct–Dec, UTC). A season board ranks XP earned inside the season (sum of XP events in the window). Default view: the live season. There is no Fall 2026 season: Winter 2027, the first season, runs from 2026-11-30T00:00Z (launch, OTA-193; was 2026-12-28) to 2027-03-31T23:59:59Z; every later season uses the plain quarter boundaries.
- **"All time" kept** as the last switcher option: it is the old leaderboard (lifetime total XP, every profile with a username, 0 XP included), so parity holds and levels have a ranking too. Season boards only list players with season XP > 0 (otherwise every season starts with 12,000 players tied at 0).
- **Ranking** (PARITY 5): XP desc, then account created_at asc, then username A–Z; rank = position, so equal XP still gets distinct ranks (#9 and #10 in the mockup). The caption says so.
- **Podium**: top 3 on page 1 only; ranks 4–53 on page 1, then 50 per page (`?page=`). Hidden while searching.
- **Paging**: `?page=` (offset over the stable sort) because the page shows ranks and page numbers and "Jump to my rank" needs the page that holds your rank; favourites and achievements use cursors (profile README). Page size 50, max 50.
- **Search**: username contains, case-insensitive, in the selected season (debounced 250 ms, `?q=` in the URL). Results keep their real rank. No match offers "Search All time".
- **Your rank bar** (signed in): rank, season XP and "N XP to pass #rank−1" with a meter (progress from the next-lower rank's XP to the next-higher); "Jump to my rank" goes to your page with `#me` and your row is highlighted with "You". Sticky at the bottom while your row is off screen (static in the mockups: full-page shots can't show sticky). Unranked: "Not on the board yet" + Browse. Guest: "Join the season" + Create account.
- **Past seasons**: "Final" chip, frozen standings, a champion line. No season rewards in v1 (open question 2).
- **Season switcher**: the existing `ol-season` disclosure of links (like the anime season selector), not a listbox: Live season, finished seasons newest first, All time.
- **Level column** is the lifetime level (plate); on phones it moves inline next to the name and the podium hides it.
- **Private profiles** still appear (username, avatar, level, XP); the row links to the private profile page.
- Liberties: crown on #1, Live/Final chip with days left and player count, "N XP to pass" meter, open plinths on an empty season.

## Worst-case content (break-ui)
Tested: 20-character usernames on the podium (wrap) and in rows (ellipsis on phones, full name in the link text), 3-character username, tied XP, 5-digit XP, rank 1,904 in search, a season with zero players. Fixes applied: phone table uses fixed column widths (rank 48 px, XP 76 px) so names never break letter by letter; level column collapses to zero width on phones.

## Accessibility check
- Contrast (computed): podium rank numbers are large text (34 px, 24 px on phones, bold): medal on its plinth 4.3–5.2:1 dark, 3.9–4.3:1 light (≥ 3:1 for large text); "You" chip and current page 9.2:1 / 6.1:1; Live chip 7.1:1 / 4.9:1; muted captions 6.6:1 / 7.3:1. Silver and bronze (`--medal-2/3`) go into `tokens.css` and `CHIP_TOKENS`.
- Focus: 2 px `--accent-ink` outline on every link and control (season trigger overridden from `--accent`).
- Targets: 44 px on phones (switcher, search, rows, pager, bar button).
- Not by colour alone: podium prints 1st/2nd/3rd (with "Rank" for screen readers), your row has a "You" label, Live/Final are words.
- Semantics: native `<table>` with a caption explaining the order; podium is an `<ol aria-label="Top 3">`; pager is a `nav` with `aria-current="page"`; result count `role="status"`; the bar is an `aside` labelled "Your rank".
- Reduced motion: `motion.md`.

## Build notes
- API: `GET /leaderboard?season=spring-2027|all&q=&page=` (page size 50, max 50; page 1 also returns the top 3; total count), `GET /leaderboard/me?season=` (rank, XP, XP of the ranks just above and below). Season windows computed from an injected `Clock`. Season XP from an indexed aggregate over XP events (or a per-season total table written with each award); measure before adding a cache (ISR 60 s on the page is enough to start). Error code `LEADERBOARD_UNAVAILABLE`.
- Web: server component reading search params; client islands only for the search input (debounced URL update) and the season disclosure (existing pattern). All calls through `apiClient()`.
- Unit tests for season windows (injected `Clock`): 2026-11-29T23:59:59Z has no season, 2026-11-30T00:00Z and 2027-03-31T23:59:59Z are Winter 2027, 2027-04-01T00:00Z is Spring 2027.
- Component tests: loading, live season, empty season, past season, All time, search hit, no match, tie order, your row on page / off page, unranked, guest, error.

## Open questions for Farouk (whole ticket)
1. Should a private profile also hide the player from the leaderboard (or offer a separate "Hide me from leaderboards" switch)? Now: private hides stats, not ranks.
2. Do season winners get anything (a badge on the profile, an XP reward, a "Champion Winter 2027" line), or is the board its own reward in v1?
3. Is the level-up card (a small modal the player dismisses) the right weight, or should it be a richer full-screen moment on the home page style (heavier GSAP scene)?
