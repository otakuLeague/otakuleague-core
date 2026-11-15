# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-15
## Current milestone
W3 Browse, then W7 rate limits. Done: catalog list API slices 1–3 (OTA-135, 177, 190), OTA-137 slice 1 (`/season`), OTA-136 Home slice 1, OTA-173/174 import guards, OTA-148 robots/sitemap, OTA-182 web→API key + visitor import limit, OTA-191/192, OTA-184 slice 1 (ADR 0017), OTA-194, OTA-166/188 design skills, OTA-185 React checklist, OTA-170 nightly encrypted backup (restore drill recorded), OTA-187 onboarding guide (`docs/ONBOARDING.md`), OTA-189 per-client rate limit (slices A–C: OTA-195 list loader forwards IP, OTA-196 search limit), OTA-199 searches-in-flight cap (DB pool waits now 503).
## Last session
OTA-139 slice 1a merged (#94): `app_user`, `auth_session`, session rules, `GET /me`. Slice 1b: argon2id `PasswordHasher`, `HashSlots` (2 running, 8 waiting, then 429 `AUTH_BUSY`), `Random.bytes`, `engines.node >=24.7`. Real-argon2 spec runs in CI only.
## In progress
- OTA-139 slice 1b PR (open): Farouk merges (touches protected package.json).
- OTA-197 (sweep of idle visitor IPs; precondition for turning the internal key on): draft PR #98, for Farouk.
- OTA-136 slices 2–4 (features, sign-up band, card meta, Logo, hero motion, `--ease-drift`); OTA-147 `/contact` (needs the email provider). Launch gate: DPAs, OTA-180/181/179 wording, contact mailbox, AnimeThemes credit (OTA-107).
- Decided 2026-11-15 (Farouk): email on Resend free plan only (80 sign-up + 20 reset/day, Sentry alert at 75); ADR 0015 addendum in the email slice.
## Next 3 tasks
1. OTA-139 slice 1c: sign-in/out. Per-IP limit runs before any hasher call; DTO counts length after NFC; export a shared normalise helper.
2. OTA-139 slices 1d–1f: AuthToken/UsernameHold, sign-up, console EmailSender; confirm + runtime proof; web apiClient session/clientIp, ADR 0003 addendum, Server Action cookie.
3. OTA-198: `claimsSlugs` gate decision, once the internal key is on.
Later: OTA-186 Mailpit + seed accounts; OTA-137 slice 2; OTA-182 slice 2b; OTA-194 follow-up (shared `currentSeason`).
## Blockers
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`. No Prisma engines: API lint/typecheck/tests run in CI only.
- Google Fonts blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`. Proxy blocks `*.up.railway.app`, `beta.otakuleague.com`. `scripts/design/shots.mjs` (no Playwright) and `scripts/screenshots/fake-sources.mjs` (no list replay) are protected-path fixes.
- Resend account and DNS (Farouk, OTA-178) still needed before mail sends. Farouk decides OTA-184 slice 2 (failed +1 inline with Retry; `URL.parse` Safari 18 / Chrome 126 floor).
- Railway Node version unverified: check `node -v` in the build log after the 1b merge; consider refusing boot in production when `crypto.argon2` is missing.
- Runtime-proof deadline 2026-11-16 at risk (needs OTA-139 1a–1f merged).
- OTA-189 deploy order: merge OTA-195 before `INTERNAL_API_KEY` is on in production, or cold lists share the `unknown` bucket.
## Known bugs
- Two ADRs share number 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails to load (no ticket).
- `next build` type check fails on main (`SeasonResultsView` export from `app/season/page.tsx`) though CI is green: check CI's build before ticketing.
- Search filter logs every 5xx with a stack, unthrottled; one visitor can take all 4 search slots (matters once the key is on). The web search page (not built) must forward `clientIp` and debounce.
## Notes
- Merging: autopilot PRs merge per OTA-176; the rest Farouk merges. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- API gap: `GET /anime/lists/:kind` has no page parameter, sort, total or rank (ADR 0016 follow-up).
- Card links: `animeLink()` (`src/anime/anime-link.ts`): `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow. Always `prefetch={false}`.
- OTA-182 rollout: before web step 3, Farouk confirms privacy-page wording (raw client IP held ~200 s, ADR 0019).
- `docs/ONBOARDING.md`: update the TL;DR when OTA-186 ships, the crash course when OTA-184 lands.
- Follow-ups: Lighthouse vs old site; anime sitemap needs a DB-only paginated endpoint (ADR 0018); ADR 0011 addendum; name OTA-184 hooks in the React checklist.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`. Redirect or detach beta.otakuleague.com, then submit the sitemap in Search Console.
