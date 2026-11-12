# Profile, XP and levels design (OTA-157)

Mockups for `/u/[username]` (and `/profile`), the edit-profile dialog and the level-up moment. The leaderboard is in `../leaderboard/` and reuses this folder's `profile.css` (avatar, level plate, XP meter, focus rings, phone frames). Open the `mockup-*.html` files in a browser (static, no JS); screenshots at 1440 and 390 px are in `shots/`. Motion: `motion.md`. Styles: `profile.css` on top of `tokens.css`, `components.css`, `../global-shell/shell.css` and `../browse/browse.css`.

| File | Shows |
| --- | --- |
| `mockup-Main.html` | Another user's public profile, Overview tab (hero, XP card, stat tiles, watch stats, favourites preview, achievements preview empty) |
| `mockup-Own.html` | Own profile: Edit profile, empty-banner prompt, completion card (3/5) |
| `mockup-Edit.html` | Edit dialog (banner too large, username taken, bio counter, birthday + visibility switch, public/private) and the avatar crop step |
| `mockup-LevelUp.html` | Level-up storyboard (frames A–C), phone, two levels at once |
| `mockup-Mobile.html` | 390 px: another user, own profile, edit sheet, private profile |
| `mockup-Light.html` | Light theme: Favourites tab, Achievements tab as it will look once definitions exist |
| `mockup-States.html` | Loading, empty (new user), private (visitor + owner notice), load error, unknown username, `/profile` as a guest |

## Direction
- Make "who is this, how far along are they, what do they love" one glance: identity, then level and XP, then four numbers, then favourites.
- Hierarchy: banner + avatar + username with level plate → XP card and stat tiles → tabs (Overview, Favourites, Achievements) → content.
- Memorable moment: the level-up card (angled level plate wipes to the new number, gold burst), only when the server says a level was crossed.
- Removed: the never-mounted Activity tab, the client spinner on `/profile` (server redirect), the separate edit-profile page as the main path (dialog first).

## Decisions
- **Level is lifetime, the leaderboard is per season.** XP and level never reset (PARITY 5 curve: L2 100, L3 300, L4 600, L5 1000; level L starts at 100·(L−1)·L/2). Profiles show lifetime XP and level, plus a link to the current season rank.
- **Tabs are routes**: `/u/[username]` (Overview), `/u/[username]/favourites` (all favourites, 50 per page, their score on the cover), `/u/[username]/achievements`. Server-rendered links with `aria-current="page"`, not an ARIA tablist.
- **Achievements tab kept** (parity lists it) with a clear empty state everywhere in v1 ("No achievements unlocked yet"); there is no unlock engine until post-launch. The badge card (name, description, icon, XP reward, unlocked date) is drawn in the Light mockup so the post-launch engine has a target. Activity tab dropped (never mounted in the old app, no data).
- **Stats**: Anime, Episodes watched, Mean score (rated entries only; "–" with none), and the status split (bar plus labelled counts, never colour alone). They come from one aggregate query, not a list scan (PARITY 7). Status counts use the My List display rule (watched ≥ total shows Completed).
- **Completion card** (owner only, hidden at 5/5): the 5 PARITY fields; each missing one is a button that opens the dialog on that field. The owner also gets an "Add banner" button in an empty banner. Visitors never see either.
- **Private profile (new)**: a "Who can see your profile" choice (Public default / Private) in the dialog. Private shows visitors avatar, banner, username, level, join date and season rank, then one "This profile is private" panel; bio, birthday, stats, favourites and achievements are not sent to the client at all (the API returns a public-fields-only shape either way, and never the email: PARITY 7). The owner sees a one-line notice with "Change". The player still appears on the leaderboard (open question 1).
- **Birthday**: shown as day and month only ("Born 14 April"), never the year, and only when the owner turns on "Show day and month on my profile" (`is_birthday_public`). The switch is mirrored in the dialog next to the field; `/settings` keeps it too.
- **Edit dialog** (Base UI Dialog; full-screen sheet below 768 px): banner, avatar, username, bio, birthday, visibility. One "Save changes" sends one `PATCH /me/profile`; images upload first. Validation mirrors the server: username 3–20 `[A-Za-z0-9_]`, case-insensitive unique, live check debounced 300 ms (Checking… / ✓ available / ✕ taken / ✕ rule); bio ≤ 300 with a counter, plain text, line breaks kept; avatar ≤ 5 MB with a crop step (square, saved at 512 px), banner ≤ 10 MB; JPG, PNG or WebP. A rejected file keeps the current image and says why. Save is disabled while a field is invalid; the footer says why. A dirty form asks before closing. `/settings/edit-profile` renders the same form as a page (deep link, no-JS fallback).
- **Username change**: the profile URL changes; old URLs 404 (parity). The 404 page offers a leaderboard search.
- **`/profile`**: a server redirect to `/u/{username}` (guest: `/auth?mode=sign-in&next=/profile`). No spinner page.
- **Level-up moment**: fired only from a write response whose XP award crosses a level. A small modal card (focus on "Nice!", Esc/scrim/buttons close, never auto-dismiss), GSAP via `next/dynamic` so pages that never level up ship no GSAP. Several levels at once show the final level and "+N levels". The My List XP chip and toast still play first; the card follows when they finish.
- **Avatars without a photo** show initials on a gradient derived from the user id (stable, no external service).
- Liberties: "Copy link" on profiles; season rank in the profile meta and XP card; crown on the season leader; the angled level plate as the profile and XP identity mark; "+ Add banner" in an empty own banner.

## Worst-case content (break-ui)
Tested: 20-character username with Lv plate (wraps under the name, `overflow-wrap: anywhere`), 3-character username, 236/300-character bio with line breaks (`white-space: pre-line`), no bio ("No bio yet." owner / line hidden for visitors), no banner (striped surface), no avatar (initials), 120-character favourite title (2-line clamp with a reserved height so the row aligns), Japanese titles, favourite without a score (no chip), 0 XP / level 1, 5-digit XP and 1,000+ anime (tabular mono, never truncated), achievement name of 80 characters (wraps in the card). Fixes applied: XP plate and numbers shrink on phones so "1,120 XP to level 17" fits; mean score "/ 10" shrinks; the dialog footer status wraps above the buttons on phones.

## Accessibility check
- Contrast (computed): muted text 6.6:1 dark / 7.3:1 light on surface; `--accent-ink` links 9.2:1 / 6.1:1; level plate text 7.2–10.8:1 dark (ink on the violet→cyan plate), white on the light plate 5.4–7.1:1; XP-gold text 11.0:1 / 6.1:1; error text on its tint 5.7:1 / 4.9:1; badge icon text ≥ 7.6:1; score chip on covers 19.9:1.
- Focus: every control on these pages uses a 2 px `--accent-ink` outline with offset (`.ol-btn` and `.ol-tab` in `components.css` still use `--accent`; the build fixes those, OTA-156 follow-up).
- Targets: 44 px on phones for tabs, buttons, completion chips, dialog fields, switch, close, media buttons, level-up buttons.
- Not by colour alone: status split repeats every segment as a labelled count; level plate prints "Lv"; completion chips use ✓ / + and text; the XP meter is a `progressbar` with `aria-valuetext`.
- Semantics: avatar `role="img"` with the username; dialog `aria-modal` with a labelled title; field hints linked with `aria-describedby`, the username check `aria-live="polite"`; file errors `role="alert"`; level-up card is a labelled dialog.
- Reduced motion: `motion.md` (level-up fades in at its settled state, no burst, no rays; bars jump).

## Build notes
- API: `GET /users/:username` (public fields only: username, avatar, banner, bio and birthday day/month when allowed, joined, level, XP, season rank, visibility; aggregate stats and up to 6 favourites unless private), `GET /users/:username/favourites?cursor` (50, max 50), `GET /users/:username/achievements`, `GET /me/profile`, `PATCH /me/profile`, `GET /profile/username-available?u=`, signed upload URLs for avatar/banner (storage choice is the build's architect step; no Supabase). Codes such as `PROFILE_NOT_FOUND`, `PROFILE_UNAVAILABLE`, `USERNAME_TAKEN`, `FILE_TOO_LARGE`.
- XP awards in write responses carry `{ points, total, level, levelledUp, previousLevel }` so the client never computes levels from partial data; the level curve lives in `packages/shared-types` with tests at 0, 99, 100, 299, 300, 1000.
- Web: page is a server component (ISR-like caching per username is fine; own profile is dynamic). Client islands: edit dialog (Base UI Dialog + a small cropper; pick one with license and size in the PR), Copy link, level-up card (dynamic import). All calls through `apiClient()`.
- Component tests: loading, public, own (completion 0–5), private (visitor and owner), no favourites, no achievements, long username/bio, load error, 404, each dialog validation state.

## Open questions for Farouk
See `../leaderboard/README.md` (one list for the whole ticket).
