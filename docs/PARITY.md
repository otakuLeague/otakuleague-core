# PARITY: feature inventory of the OLD OtakuLeague app

What this is: a read-only behavioural inventory of the old app (Next.js 15.5 + React 19 + Supabase + Tailwind/shadcn, deployed on Vercel). The new app (NestJS API + Next.js 16 web) must reach parity with better design, fewer bugs and better performance. Tickets are written from this file; autonomous runs read it instead of the old repo. No code is copied; behaviour only.

> Look and feel are **not** parity requirements (ADR 0012 addendum, 2026-11-11): colours (purple/cyan), the background, fonts and layouts below describe the old app, not a target. Keep the features and behaviour; the visual design may change completely.

- Source: old repo commit `103ec65` (Sat Dec 6 2025). Inventory date: 2026-10-31.
- `old:` paths are relative to `src/` of the old repo. "(site)" is a route group (header and footer shell).
- Terms: AL = AniList GraphQL (`graphql.anilist.co`), SB = Supabase, RLS = row level security.

## 1. Global shell

- Root layout: dark gradient background (`GlobalBackground`: drifting blurred purple/cyan orbs, 50px grid overlay, diagonal accent lines, vignette; all CSS animations), sonner toaster (top-right, rich colors, close button), Vercel Analytics + Speed Insights. Metadata title "Otaku League", tagline "Track. Compete. Level Up."
- Theme: next-themes, default `dark`, `enableSystem`; there is NO theme toggle anywhere, so dark is effectively the only theme. Brand palette: purple primary, cyan secondary, gradient text.
- Header (fixed, 64px, blurred): logo + "OtakuLeague" wordmark; desktop nav: Discover dropdown (Top Airing, Top Upcoming, Recently Completed, Last Released Episodes), Seasonal (`/season`), Rankings (`/top/anime`), Search (`/search/anime`); compact live search box (hidden on `/` and `/search/anime`); right side: guests see Leaderboard link + guest menu (Sign in / Sign up -> `/auth?mode=`); users see Leaderboard + My List + avatar menu (profile, settings, sign out). Mobile: hamburger sheet with the same links (+ "Advanced search" which points at the same page as Search) and a compact My List link/avatar. Active section highlighting by path prefix. Avatar fallback = first 2 letters of username, else email.
- Header search (`AnimeSearch`): debounced, min 3 chars, max 8 results, AL `SearchAnime` query direct from the browser, keyboard nav (arrows/enter/scroll), in-memory cache, Enter navigates to `/anime/{anilistId}`.
- Footer: logo, links Roadmap (external Notion page), "Learn About Us" (`/faq`), "Contact Us" (`/contact`); social icons: X (@otakuLeague2025), Discord invite, Instagram (otaku__league), TikTok (@otakuleague), Facebook page. Contact email: contact@otakuleague.com.
- Shell is skipped (no header/footer) on `/auth*` and `/onboarding` (`ConditionalHeader`). Note: `/sign-in`, `/sign-up` and `/reset-password` pages outside `/auth` get the full shell.
- `OnboardingGuard` (client): after login, if `profiles.has_completed_initial_profile` is false (or no profile) redirect once to `/onboarding`.
- Auth gating UI: `RequireAuth`/`AuthWall` (full-page "Log in to ..." wall with feature teasers), `AuthModal` (inline modal used by add-to-list when logged out).
- Loading/error: `anime/[id]/loading.tsx` + `error.tsx` only; spinners (Loader2) elsewhere; `u/[username]/not-found.tsx`. No global not-found, no global error page, no per-route skeletons except discover/season grids.
- Image domains allowed: AniList CDN (`*.anilist.co`), MAL CDN, YouTube thumbs, Crunchyroll thumbs, unsplash (mock art), Supabase storage public paths. AVIF/WebP, 1 day min TTL, qualities 75/90.

## 2. Routes (src/app)

### `/` Home (`app/page.tsx`)
- Purpose: landing + search entry. UI: `HeroSection` (badge "Level up your experience", gradient H1 "Otaku League", tagline "Your Otaku HQ - track, level up, and connect", hero search panel, CTA to `/search/anime`), `FeaturesSection` (4 static cards: Community-first, Curated discovery, Powerful tracking, Reliable data), `RoadmapSection` (3 static cards: Manga support, Friends and notifications, List comparator).
- Auth-aware hero card: guest -> "Create your account" (`/sign-up`) / "I already have one" (`/sign-in`); logged in -> welcome name + XP preview (`XPBar`: level, XP, progress to next level) from `useXpProgress`.
- Data: Supabase `profiles`, `user_xp` via the `currentUser` React Query. States: XP loading/unauthenticated/loaded/error. old: `components/HeroSection.tsx`, `components/home/*`, `components/XPBar.tsx`.

### `/discover/anime` (Discover hub)
- Purpose: curated browse. UI: `SpotlightCarousel` (auto-advancing hero slides, 1s ticking countdown to next episode, trailer link, Add to list + Favourite buttons, badges for trending) and `DiscoverSections`: genre quick-filter chips ("Curated picks for you") plus carousels Most Popular, Fan Favorites, Latest Episodes, Recently Completed, Upcoming Hype, Newly Added Gems, each with "view more" link.
- Data: AL `MediaList`/`AiringSchedule` queries called from the BROWSER (`requestAniList`), adult filter from user setting. States: per-section skeleton/error. old: `app/(site)/discover/anime/page.tsx`, `components/SpotlightCarousel.tsx`, `components/DiscoverSections.tsx` (1500+ lines).

### `/discover/top-airing`, `/top-upcoming`, `/recently-completed`, `/last-released-episodes`
- Four near-identical client pages (~260 lines each, copy-paste). Purpose: ranked lists. Filter bar (`DiscoverFilters`: text search, format multi-select TV/Movie/ONA/OVA/Special/Music, genre multi-select with removable chips, reset), grid vs compact-grid toggle (persisted in localStorage `discover-view-mode`), filters persisted per page in localStorage, infinite "load more", trailer modal (`TrailerModal`), Add to list + Favourite on cards, SpotlightCarousel on top.
- Data/semantics (AL): top-airing = status RELEASING sort POPULARITY_DESC; top-upcoming = NOT_YET_RELEASED sort POPULARITY_DESC; recently-completed = FINISHED sort END_DATE_DESC (menu text says last 90 days); last-released-episodes = `airingSchedules` of last 7 days, deduped per anime, newest first. Multi-genre/format selection is OR-filtered CLIENT-side after fetching a page (counts per page inconsistent). perPage derived from view mode to fill rows.
- States: loading skeleton, error + retry, empty. old: `app/(site)/discover/*/page.tsx`, `components/discover/*`, `lib/discover/queries.ts` (fetchTopAiring, fetchTopUpcoming, fetchRecentlyCompleted, fetchRecentlyReleasedEpisodes, fetchTopAnime, fetchGenres).

### `/season` (Seasonal) and `/seasons/anime`
- `/season`: real. Season (Winter/Spring/Summer/Fall) + year selectors (default = current season by month, Winter 0-2 ... Fall 9-11, timezone aware), sort (popularity, score, start date, title English/Romaji), grid/list view, filters: formats, status, genres (any/all mode), min/max score, min/max episodes, text search (200 char cap). All state in URL query. Infinite scroll via React Query `useSeasonalQuery` (AL `MediaList` with season/seasonYear). Cards have Add to list/Favourite. old: `app/(site)/season/page.tsx` (536 lines), `components/season/SeasonControls.tsx`, `hooks/useSeasonalQuery.ts`, `lib/season.ts`.
- `/seasons/anime`: MOCK. Hardcoded fictional shows ("Echoes of Radiant Frost" etc.) with season filter. Not linked from nav. Drop.

### `/top/anime` (Rankings)
- Purpose: leaderboard of anime. `RankingsControls`: sort (Score default, Popularity, Favourites, Title A-Z, Title English, Start Date), view toggle, formats (TV, TV Short, ONA, OVA, Movie, Special), status, genres + genre mode, min/max score, min/max episodes, year (1917..next year), search. URL-synced. 50 per page, rank numbers. Data: AL via `fetchTopAnime`; substring search and multi-select are client-side filtered over fetched pages, so ranks/pagination are inexact. old: `app/(site)/top/anime/page.tsx` (662 lines), `components/rankings/RankingsControls.tsx`.

### `/search` (simple, mock)
- Server page reading `?q`; renders results from `lib/search/data.ts` which is a HARDCODED MOCK array; every card's "View details" links to `/discover/anime` regardless of item. Uses sync `searchParams` (Next 15 async API violation). Dead-end; replaced in practice by `/search/anime`.

### `/search/anime` (real search + advanced filters)
- Purpose: the actual search. Free text + filter panel (draft vs applied filters): formats, season + single year, genres, tags, min/max score, min/max episodes, source material (`MediaSource`), age rating, adult toggle, sort (Score, Popularity, Trending, Title A-Z/Z-A, Newest, Oldest); grid/list view; URL-synced; infinite scroll (IntersectionObserver, 24 per page); card actions Add to list/Favourite. Data: AL `MediaList` direct from browser. old: `app/(site)/search/anime/page.tsx` (1049 lines, largest file).

### `/search/advanced` (mock)
- Client page with query, sort (popularity, score, newest, relevance) and genre chips using `/api/search/advanced` + `/api/meta/genres`, both backed by the same MOCK data (`lib/search/data.ts`). Not linked in nav. Drop.

### `/anime/[id]` (anime detail; id = AniList numeric id)
- Server-rendered: `getAnimeDetails(id)` = AL `MediaById` (+ AnimeThemes for openings/endings), `generateMetadata` sets title only (no OG/description/image). Non-numeric id throws -> generic error page (not 404). 15 min fetch cache.
- Layout: `AnimeBanner` (banner or blurred cover), `AnimeHero` (cover, titles EN/romaji/native, format, status badge, season/year, episode count, score + popularity stats, next-airing "Ep N in Xd Xh" countdown, genre/theme pills, clamped synopsis, **Add to list** dialog, **Favourite** heart, Watch Trailer button, external link buttons, viewer's own entry summary: status/score), sticky tab bar (client state only, no URL per tab; tab bar pins under header when hero scrolls away). Tabs: General, Episodes, Media, Characters, Staff, More.
- General: synopsis, Themes and Genres, Official Links, At a Glance (format, episodes, duration, source, country, season), Studios and Producers, Release Timeline (start/end dates), Alternative Titles/synonyms.
- Episodes: list from AL `streamingEpisodes` (title, thumbnail, external stream link, sortable); "No episodes available yet" when empty. No air dates, no per-episode progress, no watched checkboxes.
- Media: trailer(s) ("Preview coming soon" placeholder for non-playable), Openings/Endings (AnimeThemes audio/video links with up to a few extra sources collapsible), Source Material (relations with type SOURCE), Other Media (rest of relations, show more/less).
- Characters: up to 25 by role (Main/Supporting) with Japanese VA (name, image, language fallback "Language TBA"); "No characters found."
- Staff: up to 25 (`PeopleList`), role-sorted.
- More: recommendations grid (up to 20 by rating).
- Data: AL only for anime data; SB only for viewer entry (`anime_catalog`, `user_anime_list`). Not present: reviews, comments, ratings by community, Jikan data, franchise/seasons view, stats tab, music tab as separate route. old: `app/anime/[id]/*`, `components/anime/**`, `lib/anime/{service,detailResolver,types}.ts`, `lib/anilist/{queries,mappers}.ts`, `lib/themes/themesService.ts`.
- Dead code: `components/anime/hero/ListControls.tsx` (alt list form that toasts "frontend-only mode").

### `/my-list` (auth required)
- Purpose: track anime. `RequireAuth` wall for guests. Loads ALL entries once via `GET /api/my-list/entries` (no pagination). Views: Board (kanban columns, dnd-kit drag between statuses, always shows empty columns), Table, Cards; filter chips All, Favourites, and each status with counts; search by title; sort: title A-Z/Z-A, score high/low, recently updated. Inline +/- episode controls (clamped to total), status change, score, favourite, rewatch status. Entry whose episodes_watched >= episodes_total is DISPLAYED as Completed even if stored differently (display-only rewrite). MAL import dialog (accepts `.xml`). Unused: query-string helpers in `lib/my-list/filters.ts` (status/view/page/score/progress params) suggesting planned URL state/pagination.
- Data: SB `user_anime_list` joined `anime_catalog`; adult entries (genre "Hentai") hidden unless `profiles.allow_adult_content`. Writes through `POST /api/my-list/update` or server action `updateUserAnimeEntry`. States: spinner, error silently swallowed (list shows empty on failure), empty columns. No delete/remove-from-list action found. old: `app/(site)/my-list/**`, `lib/anime-list/*`, `lib/my-list/*`.

### `/leaderboard`
- Purpose: XP ranking of users. Podium (top 3 cards) + searchable paginated list (50 per page via `?page`, username contains-search over ALL users, shows rank, avatar, level, total XP, link to `/u/{username}`). Server rendered via admin client; no auth needed. Ranking rules in section 5. old: `app/(site)/leaderboard/**`, `lib/leaderboard.ts`.

### `/u/[username]` (public profile)
- Purpose: profile page, ISR 60s. `ProfileHero` (banner, avatar, username, bio, join date, "Born {date}" only if `is_birthday_public`, level + XP bar, stat cards, Edit button for own profile opens `ProfileEditDialog` with avatar cropper) + tabs Overview (stats: watching/completed/on hold/dropped/plan counts, episodes watched, average score, favourites preview, achievements preview, profile-completion card for owner), Favorites (grid of favourited anime with user score), Achievements (badge cards: name, description, icon, XP reward, unlocked date; "No achievements unlocked yet"). `ActivityTab` exists but is NOT mounted and the loader always returns an empty activity array.
- Data: SB admin client (service role) -> `profiles`, `user_xp`, `user_achievements` + `achievements`, `user_anime_list` + `anime_catalog` (favourites limit 50, achievements limit 50). 404 via `not-found.tsx`. Username lookup exact match. old: `app/u/[username]/*`, `lib/profile/{loader,profile-data,types}.ts`, `components/profile/**`.

### `/profile`
- Client redirect to `/u/{username}` for the logged-in user (or `/settings` if no username); guest sees "Log in to view your profile" card. Spinner while resolving.

### `/settings`
- Title "Parameters". `SettingsForm`: Adult content switch (only enable-able if 18+ from birthday; otherwise toast), "Birthday public" switch, language select (en active; ja/es/fr labelled "coming soon" but stored). Saved via `POST /api/settings/update` (server re-enforces 18+ rule; unknown language -> en). Retry card on load failure. Links to edit profile. Unknown birthday counts as under 18. old: `app/(site)/settings/{page,actions}.tsx`, `_components/settings-form.tsx`, `lib/settings.ts`, `hooks/useUserSettings.ts`.

### `/settings/edit-profile`
- `EditProfileForm` (react-hook-form + zod): username (3-20, letters/digits/underscore, live availability check against `/api/profile/check-username`), birthday (DD/MM/YYYY input + calendar), bio (max 300), avatar upload (<=5 MB, crop via react-easy-crop) and banner upload (<=10 MB). Files uploaded straight from the browser to SB Storage buckets `avatars` and `banners` at `{userId}/avatar.{ext}` / banner (upsert), public URL saved to `profiles`. Redirects to `/auth?mode=signin` if logged out; success toast then redirect to `/u/{username}`.

### `/settings/import-export`
- Placeholder: "Integrations are on the roadmap". The only working import is the MAL dialog inside My List. No export anywhere.

### Auth: `/auth`, `/sign-in`, `/sign-up`
- `/auth?mode=signin|signup` is the real page (`AuthLayout` + `SignInForm`/`SignUpForm`, mode synced to query). `/sign-in` and `/sign-up` are client-side redirects to it (flash). Sign in: single field "email or username" + password; username is resolved through `/api/auth/resolve-username` (server signs in, returns session without email); email path calls SB `signInWithPassword` in the browser; "Continue with Google" (SB OAuth); forgot-password link; resend-confirmation flow with `EmailVerificationDialog`. Sign up: username (live availability `/api/users/availability`), email, password + confirm (>= 8 chars and a number or symbol), Google signup; posts `/api/auth/signup`; shows email-verification dialog (confirm email required). No terms/privacy checkbox. Callback `/auth/callback` (see API).
- Duplicate routes: `(auth)/forgot-password`, `(auth)/reset-password` AND `auth/forgot-password`, `auth/reset-password` exist (the reset pair differs; forgot pair is identical copy).

### `/auth/forgot-password`, `/auth/reset-password`
- Forgot: email form -> `POST /api/auth/forgot-password` (always generic success; in-memory per ip+email rate limit, 429 with retry seconds) -> SB sends the email. Reset: reads recovery session from the email link, new password + confirm with strength rule, `POST /api/auth/reset-password`, then redirect to sign in. Error state for expired/invalid link.

### `/onboarding`
- Full-screen wizard (6 steps): 0 Welcome, 1 Avatar (optional), 2 Banner (optional), 3 Username (required, availability check), 4 Birthday (optional), 5 Bio (optional). Saves via `POST /api/profile/update` then `POST /api/profile/mark-onboarding-complete`. Redirects to `/` if already completed, to sign in if logged out. `mark-onboarding-seen` route exists but is unused by the visible flow. No way to skip the whole wizard other than finishing steps.

### `/faq` ("About us")
- Static accordion, 5 Q&As: What is OtakuLeague, What to expect, How it works, How to report a bug, Is it free (answer: free, future may add optional extras). Founder-voice copy. Link to contact/Discord.

### `/contact`
- Form: email*, subject*, message*, optional name -> `POST /api/contact` -> Resend email to contact@otakuleague.com with reply-to. Also mailto link and social icons (Discord, X, Instagram, TikTok, Facebook). States: submitting, success toast, error toast.

### `/community`
- "Coming soon" placeholder (community hub, watch parties). Not in nav.

## 3. API routes (src/app/api, all Next route handlers)

Auth = Bearer token from SB session (`fetchWithAuth`) or cookie session; no shared middleware, each route re-implements token/session lookup.
- `GET /api/me/profile`: current profile row. Auth. `profiles`.
- `PATCH /api/me/profile`: update username (409 if taken), bio, birthday, avatar/banner URLs. Auth. `profiles`.
- `POST /api/profile/update`: zod-validated profile upsert used by onboarding; calls RPC `ensure_profile`; 409 on duplicate username. Auth. `profiles`.
- `GET /api/profile/check-username?u=`: availability via RPC `username_available`; 409 when taken. Public. `profiles`.
- `GET /api/users/availability?username=`: second, near-duplicate availability check (same RPC). Public.
- `POST /api/profile/mark-onboarding-complete`: sets `has_completed_initial_profile` (+seen timestamp). Auth. `profiles`.
- `POST /api/profile/mark-onboarding-seen`: sets `onboarding_seen_at`. Auth. `profiles`.
- `POST /api/settings/update`: adult/birthday-public/language, enforces 18+. Auth. `profiles`.
- `GET /api/my-list/entries`: entire list with catalog join, adult filter. Auth. `user_anime_list`, `anime_catalog`, `profiles`.
- `POST /api/my-list/update`: partial update of status (validated against enum), score (NOT validated), episodes, rewatch_count, favourite for one anime id. Auth, RLS-scoped client. No XP award, no existence check (updating a missing row is a silent no-op success).
- `POST /api/import/mal`: multipart `.xml` MAL export; see section 6. Auth. `anime_catalog`, `user_anime_list`.
- `POST /api/auth/signup`: validates username/password, checks username in `profiles`, checks email by listing ALL auth users, calls SB `signUp` (email confirmation), inserts/repairs `profiles` row. Public.
- `POST /api/auth/resolve-username`: username + password -> server-side sign-in via admin lookup of email; returns session with email stripped. Public, no rate limit.
- `POST /api/auth/forgot-password`: SB reset email, generic response, in-memory rate limit. Public.
- `GET|POST /api/auth/reset-password`: check recovery session / set new password. Recovery session.
- `GET /auth/callback`: OAuth/email-confirm code exchange, `ensure_profile`, generates a username for OAuth users (from email, sanitized, fallback `user_xxxxxxxx`, random suffix on clash), redirects to onboarding or home based on `has_completed_initial_profile`.
- `POST /api/contact`: Resend email to contact address; subject cap 200, message cap 5000. Public, no rate limit/captcha. In dev, email is stubbed.
- `GET /api/search`, `GET /api/search/advanced`, `GET /api/meta/genres`: MOCK data. Drop.
- Server action `settings/actions.ts` and `my-list/actions.ts` duplicate the REST update logic.

## 4. Data model (Supabase Postgres)

Migrations in repo are partial (7 files, Feb 2025); `profiles`, `user_xp`, `user_xp_events`, `achievements`, `user_achievements`, `anime_catalog`, `user_anime_list` and the RPCs/RLS are NOT in migrations and were created in the SB dashboard. Schema below is inferred from code.
- `profiles`: id (= auth user id), username (citext unique), email, bio (<=300), birthday (date), is_birthday_public, avatar_url, banner_url, allow_adult_content, language_preference (en/ja/es/fr), has_completed_initial_profile (default false; backfilled true where onboarding_seen_at set), onboarding_seen_at, created_at, updated_at. Trigger `handle_new_user` on `auth.users` inserts a profile with username from metadata or email local-part or `user_{id8}`. RPCs: `ensure_profile`, `username_available`, `is_username_available(citext)`.
- `anime_catalog`: id (bigint PK), provider ("Anilist" in practice), provider_media_id (text), unique (provider, provider_media_id), title, episodes_total, poster_url, cover_url (banner or poster), format, year, average_score, trending_rank, popularity_rank, studio_main, genres[], synopsis, next_episode_number, next_episode_at, trailer_url, cover_image_storage_path (Storage path in bucket `anime-covers`, indexed where null), updated_at. Rows are created lazily from AL data on first add-to-list or import.
- `user_anime_list`: (user_id, anime_id -> anime_catalog.id) unique; status enum UPPERCASE (PLAN_TO_WATCH, WATCHING, COMPLETED, ON_HOLD, DROPPED, REWATCH), score 0-10 nullable, episodes_watched, rewatch_count, is_favorite, completed_at, last_watched_at, created_at, updated_at.
- LEGACY `anime_list_entries` (migrations 02-11/02-07/02-08): user_id, anilist_id/mal_id (at least one), lowercase enum `anime_watch_status` (watching, completed, on_hold, dropped, plan_to_watch), score, progress, is_favorite, started/completed dates; view `user_favorite_anime`. Superseded by `user_anime_list`; code still references the old name in comments and stubs (`lib/anime/list.ts`).
- `user_xp`: user_id, total_xp, level, xp_to_next_level, last_action_at. `user_xp_events`: id, user_id, key, xp_delta, created_at. `achievements`: id, name, description, icon_url, xp_reward. `user_achievements`: user_id, achievement_id, created_at.
- RPCs: `grant_xp(p_user_id, p_action_slug, p_metadata)` returns event, points, new total/level, blocked + reason (`max_per_day`, `cooldown`); `award_action_xp(p_user_id, p_action_key, p_anime_id, p_metadata)`; `accept_referral(p_invite_code, p_new_user)`; `compute_level` SQL function.
- Storage buckets: `avatars`, `banners` (user uploads, public), `anime-covers` (cached AL covers). Auth: SB Auth email+password and Google OAuth.

## 5. Domain rules

- XP level curve (`lib/xp.ts`, mirrors SQL `compute_level`): xp<=0 -> level 1; otherwise n = floor((sqrt(1 + 8*xp/100) - 1)/2), level = n+1; level L starts at 100*n*(n+1)/2 XP (triangular: L2=100, L3=300, L4=600, L5=1000); next threshold 100*(n+1)*(n+2)/2; progress ratio = XP into level / level span. Negative XP clamped to 0.
- XP is awarded server-side only (RPC). Client sends action keys on list changes (`list.add`, `list.mark_watching`, `list.mark_completed`, `list.mark_dropped`, `list.rate`) after upsert from the add-to-list dialog; failures are swallowed. POINT VALUES, daily caps and cooldowns live in DB tables not in the repo (unknown; reconstruct from product intent). Other declared slugs (`finish_anime`, `watch_episode`, `daily_check_in`, `invite_friend_accepted`, `write_review`, `complete_profile`) and the `/xp` grant + referral handlers in `lib/xp.ts` are NOT wired to any route or UI. Quick updates via `/api/my-list/update` or MAL import grant no XP.
- Achievements: only read/displayed. No unlock logic, no definitions, no seeds in the repo; `achievements` is presumably hand-seeded or trigger-driven in SB (unknown).
- Leaderboard ranking: all profiles with a username; XP 0/level 1 if no `user_xp` row; sort total_xp desc, then created_at asc (older wins), then username A-Z; rank = position; top 3 podium, rest paginated 50; search is username-contains.
- Username rules: 3-20 chars, `[a-zA-Z0-9_]`; uniqueness case-insensitive (citext / lowercase in RPC) although sign-up validation is case-sensitive regex; availability checked live (debounced); sign-in by username is case-sensitive exact match; OAuth-generated usernames sanitized from email, min 3, fallback `user_{uuid8}`.
- Password: >= 8 chars and at least one digit or symbol. Email regex `x@y.z`.
- Profile completion (owner card): 5 fields counted (username, avatar, banner, bio, birthday); percent = filled/5.
- Adult content: allowed only if birthday present and age >= 18 (unknown birthday = not adult) AND `allow_adult_content`. Filtering is by AL `isAdult` for discover queries and by genre "Hentai"/format on my-list.
- List statuses: PLAN_TO_WATCH, WATCHING, COMPLETED, ON_HOLD, DROPPED, REWATCH (UI lower_snake mapping). Score integer 0-10 (0/null = unrated). Episodes clamped to total. Display rule: watched >= total shows Completed (except REWATCH).
- MAL import mapping (`api/import/mal`): parse `<anime>` blocks with regexes; MAL id = `series_animedb_id`; look up AL by `idMal`; `my_status` strings or numeric codes 1 Watching, 2 Completed, 3 On-Hold, 4 Dropped, 6 Plan to Watch (unknown -> Plan to Watch); `my_score` 0 -> null, valid 0-10 kept; `my_watched_episodes`; `my_finish_date` -> completed_at only if COMPLETED and valid; favourites reset to false; rewatching/start date/tags/comments ignored. Batches of 5 with a 6 s pause (about 50 entries/minute) inside ONE request; response `{total, imported, skipped, errors[{malId, reason}]}`.

## 6. Integrations

- AniList GraphQL (browser AND server): queries `SearchAnime`, `MediaById`, `MediaByIdMal`, `AnimeDetail` (legacy), `MediaList` (filters/sort/paging), `AiringSchedule`, `GenreCollection`, `MediaSummary`. Detail fields: titles, synonyms, description, cover/banner, format, status, episodes, duration, source, country, season, dates, averageScore, meanScore, popularity, favourites, genres, tags, nextAiringEpisode, trailer, streamingEpisodes, externalLinks, studios, staff(25), characters(25 + VA), relations, recommendations(20). Client wrapper: up to 5 retries on 429/5xx with Retry-After + jitter, concurrency scheduler (default 4), in-memory LRU TTL cache (500 entries) and in-flight dedupe; TTLs search 60 s, detail 15 min, airing 3 min, discover 2 min; Next `revalidate` tag "anilist" server-side. Three overlapping client modules (`lib/api/anilistClient.ts`, `lib/anilist/client.ts`, `lib/api/httpClient.ts`/`backendClient.ts`).
- AnimeThemes (`animethemes.moe/api`): openings/endings by AL id then MAL id, `filter[has]=themes`, in-memory cache. Jikan (`api.jikan.moe/v4`) only as an optional themes fallback behind `THEMES_FALLBACK_JIKAN` (default off); Jikan is otherwise unused (no MAL stats/reviews/episodes).
- Resend: used ONLY by `/api/contact`. Templates `renderPasswordResetEmail` and `renderVerificationEmail` exist in `lib/email/templates.ts` but are never called (Supabase sends auth emails). Env `RESEND_API_KEY`, `EMAIL_FROM`; stubbed in dev if missing.
- Supabase: Auth (password, Google), Postgres, Storage. Four overlapping client modules (`lib/supabase*.ts`, `lib/supabase/*.ts`): browser, server/cookie, token-bearing, admin (service role).
- Images: next/image remote patterns; cover caching script (`scripts/cacheAnimeCovers.ts`, `backfillAnimeCovers.ts`, npm script `backfill:anime-covers`) uploads AL covers into bucket `anime-covers` and records `cover_image_storage_path`; app prefers the Storage URL when set. Other images hotlinked from AL CDN. Check licence/terms before replicating (project rule).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, cache TTL and scheduler overrides, `THEMES_FALLBACK_JIKAN`, `ANIMETHEMES_ENDPOINT`, `JIKAN_FALLBACK_ENDPOINT`.

## 7. Known problems in the old app

Security
- `profiles` public loader uses the service-role admin client and its view model carries `email`; confirm the email is never serialised to the client in `/u/[username]` (RSC payload) and prefer a public-fields-only query.
- `/api/auth/signup` lists ALL auth users to check email uniqueness (O(users), default page cap ~50 so it silently stops working at scale) and reveals which emails exist; `/api/auth/resolve-username` has no rate limit (password guessing by username); forgot-password rate limit is an in-memory Map (resets per serverless instance); `/api/contact` has no rate limit/captcha and returns internal error messages.
- Tokens: every route hand-rolls bearer vs cookie session lookups (`getSession` trusted on server instead of `getUser`), no shared auth guard, inconsistent error shapes (`{error:string}`, `{error:{message}}`, `{error, message}`).
- Score and episodes in `/api/my-list/update` are not range validated; request body trusted by type cast; MAL import has no file size limit and parses XML with regexes.
- Client-side direct DB writes (add-to-list upserts, storage uploads from browser) rely entirely on RLS that is not versioned in the repo.
- Sign-up usernames are case-sensitive in validation but case-insensitive in DB; Google users get auto-generated usernames silently.

Correctness
- Schema drift: migrations do not define the tables the app uses; legacy `anime_list_entries` and lowercase enum vs live `user_anime_list` with uppercase enum; `lib/anime/list.ts` contains stubbed "frontend-only" functions that return mock entries and write nothing (toast says "frontend-only mode").
- `fetchAnimeListEntry` guesses the catalog row by trying the AniList id, MAL id AND the internal catalog primary key as candidates, so an AL id can match the wrong catalog row.
- MAL import spreads AL `id` into the catalog upsert, forcing catalog PK = AniList id; and creates entries without awarding XP or setting started dates.
- Leaderboard fetches the entire `profiles` and `user_xp` tables (SB default 1000-row cap silently truncates), joins in JS, passes the whole user list to the client for search, and runs per request with no caching.
- Activity feed never built (empty array); Achievements have no unlock logic; XP slugs/referrals unwired; XP only on dialog upserts (inline +/- and drag do not award XP).
- My List: whole list in one request, no pagination (violates new rule); errors swallowed (empty list on failure); display-only auto "Completed" disagrees with stored status; no remove action.
- Discover/top lists filter genres/formats client-side per fetched page, so counts and ranks are wrong with multi-select.
- `/anime/[id]` throws on bad id (500-style error page instead of 404); no canonical slugs, no OG metadata; tabs not addressable by URL; relations only surface in Media tab; episode tab has no dates.
- `/search` simple page uses sync `searchParams` and mock data; `/search/advanced`, `/seasons/anime`, `/api/search*`, `/api/meta/genres` are mock only.
- Duplicate routes and files: `(auth)` vs `auth` forgot/reset pages, `/sign-in` `/sign-up` client redirects, two username-availability endpoints, two update paths (action + REST), four near-identical discover pages.
- Dead code: LatestEpisodes (mock episodes), TrendingTabs, GenreChips, AnimeCarousel, EpisodeTile, SimpleSearchBar, LandingBackground, QuickWatchlistButton, ListControls, ActivityTab, general/AnimeCard vs AnimeCard duplicates, email templates, legacy AL query, `useXpProgress` (deprecated wrapper), onboarding `seen` route.
- Language setting accepts ja/es/fr but there is no i18n.

Performance
- All AL traffic is called from the browser per visitor (no shared server cache; in-memory LRU per tab; rate limit risk per IP); Discover sections fire ~7 AL requests on load.
- Giant client components (SpotlightCarousel ~800, DiscoverSections ~1500, search/anime ~1050 lines) and client-only pages for what could be server-rendered/streamed.
- Constant CSS animations on full-viewport blurred orbs (GPU heavy on mobile); 1 s interval timers in carousel.
- MAL import blocks one HTTP request for minutes (50 per minute); will time out on Vercel for big lists. Needs background job + progress.
- Profile page needs 5 queries plus a full list scan to compute stats instead of aggregates.

## 8. Feature table

| Feature | Old location | Priority guess |
|---|---|---|
| Sign up / sign in (email+password, username sign-in, Google), email confirmation | `/auth`, `/api/auth/*` | v1 |
| Forgot / reset password | `/auth/forgot-password`, `/auth/reset-password` | v1 |
| Onboarding wizard (avatar, banner, username, birthday, bio) | `/onboarding` | v1 |
| Profile edit, avatar/banner upload + crop | `/settings/edit-profile`, `components/profile` | v1 |
| Public profile (stats, favourites, achievements) | `/u/[username]`, `/profile` | v1 |
| Settings (adult content 18+, birthday visibility) | `/settings` | v1 |
| Language preference (ja/es/fr) | `/settings` | post-launch (no i18n) |
| Anime detail with 6 tabs | `/anime/[id]` | v1 (already partly in new app: slugs, 6 tab routes) |
| Openings/endings (AnimeThemes) | Media tab | v1 |
| Add to list dialog (status, score, episodes) + favourite | `AddToListButton`, `FavoriteButton` | v1 |
| My List (board, table, cards, filters, sort, inline progress) | `/my-list` | v1 |
| MAL XML import | `/api/import/mal`, dialog | v1 (as background job) |
| List export, AniList import | `/settings/import-export` (placeholder) | post-launch |
| Discover hub (spotlight + 7 sections) | `/discover/anime` | v1 |
| Top airing / upcoming / recently completed / last episodes | `/discover/*` | v1 (one parametrised page) |
| Seasonal browse with filters | `/season` | v1 |
| Rankings (top anime) | `/top/anime` | v1 |
| Search with filters (real) | `/search/anime`, header search | v1 |
| Simple search page, advanced search page (mock) | `/search`, `/search/advanced` | drop |
| Seasonal mock page | `/seasons/anime` | drop |
| XP, levels, progress bar | `lib/xp.ts`, `XPBar`, profile | v1 |
| XP point rules (per action, daily cap, cooldown) | DB only, unknown | v1 (needs design) |
| Leaderboard (podium, search, paging) | `/leaderboard` | v1 |
| Achievements (display) | profile tab | v1 display, post-launch unlock engine |
| Activity feed | `ActivityTab` (unmounted) | post-launch |
| Referrals / invite friends | `lib/xp.ts` handlers (unwired) | post-launch |
| Contact form + Resend | `/contact`, `/api/contact` | v1 |
| FAQ / About | `/faq` | v1 |
| Footer socials, roadmap link | `Footer` | v1 |
| Landing page (hero, features, roadmap teaser) | `/` | v1 |
| Community hub | `/community` ("coming soon") | post-launch |
| Manga support, friends, notifications, list comparator | home roadmap cards only | post-launch |
| Episode tracking per episode (watched checkboxes), reviews, comments | not present | post-launch |
| Cover image caching to storage | `lib/anime/cacheCover.ts`, scripts | v1 if licence allows |
| Theme toggle / light theme | none (dark only) | post-launch |
| Analytics / speed insights | `@vercel/*` | v1 (replace per ADR 0004 stack) |
