# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-19
## Current milestone
W3 Browse, then W7 rate limits, then accounts (OTA-139). Done: catalog list API (OTA-135, 177, 190), OTA-137 slice 1, OTA-136 Home slice 1, OTA-184 slice 1 (ADR 0017), OTA-189 A–C, OTA-139 slices 1a–1d, OTA-197, OTA-199, OTA-200, OTA-201, OTA-202, plus earlier W3/W7 slices.
## Last session
OTA-139 slice 1e-i shipped in PR #116 (sign-up, `EmailSender`; see ADR 0020). Before: 1d (#111), OTA-202 (#107), 1c-iii (#109), OTA-204 (#110).
## In progress
- OTA-139 slice 1e-i: PR #116 open on `feat/OTA-139-sign-up-verification`.
- OTA-197 leftovers: per-/48 IPv6 bucket + Vercel firewall rule; forged `X-Forwarded-For` spoof check on a preview.
- OTA-136 slices 2–4; OTA-147 `/contact` (needs email provider). Launch gate: DPAs, OTA-180/181/179, contact mailbox, OTA-107.
- Email on Resend free plan only (decided 2026-11-15): 80 sign-up + 20 reset/day, Sentry alert at 75; ADR 0015 addendum in the email slice.
## Next 3 tasks
1. OTA-139 slice 1e-ii: confirm + resend + `AUTH_TOKEN_INVALID`. Lock `app_user` before consuming the token; resend must not outlive the username hold; a confirm without a matching binding must not activate the pending password.
2. OTA-139 slice 1f: web side (cookie, Server Actions, pages), ADR 0003 addendum; web contracts in Notes.
3. OTA-186 Mailpit + seed accounts.
Later: OTA-198 `claimsSlugs` gate decision; OTA-137 slice 2; OTA-182 slice 2b; OTA-194 follow-up (shared `currentSeason`).
## Blockers
- Runtime-proof checkpoint 2026-11-23 (needs OTA-139 1a–1f merged).
- `AUTH_HMAC_KEY` on Railway (API): `[A-Za-z0-9_-]{43,128}`, distinct from every `INTERNAL_API_KEY*`; boot fails without it.
- Run `SHOW timezone` on Railway's Postgres; if it was ever not UTC, stored rows are shifted (OTA-200).
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`. No Prisma engines: API lint/typecheck/tests run in CI only.
- Google Fonts blocked in cloud: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`.
- Resend account and DNS (Farouk, OTA-178) before mail sends. Farouk decides OTA-184 slice 2.
- Railway Node version unverified: check `node -v` in the build log; consider refusing boot in production when `crypto.argon2` is missing.
## Known bugs
- Two ADRs share number 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails to load (no ticket).
- `next build` type check fails on main (`SeasonResultsView` export from `app/season/page.tsx`) though CI is green: check CI's build before ticketing.
- Search filter logs every 5xx with a stack, unthrottled; one visitor can take all 4 search slots. The web search page must forward `clientIp` and debounce.
- Sign-in: identifier/password need an `isWellFormed()` check (lone surrogates become U+FFFD); no route test yet of the 30 per identifier per hour ceiling.
## Notes
- Merging (OTA-202): autopilot merges once CI is green and the matching Fable review has no Critical, including migrations, deps, `.claude/`, configs and deploy files. `.github/workflows/*`, `.github/actions/*` and `.github/autopilot-protected-paths` stay with Farouk. Outside-repo steps stay draft with `needs-human`.
- Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- 1e-i follow-ups: map Postgres 40P01 to 503 (filter); keyed email hash on the hold (own form re-submit answers 409 for 24 h); reserved-username deny list; migration CHECK `expires_at > created_at`, UNIQUE(`user_id`, `purpose`). Revoked sessions wait for expiry (≤30 days).
- Web contracts for 1e–1f: sign-up stores `normaliseIdentifier` output in `email`/`usernameKey` and refuses "@" in usernames. Web sends `X-Client-Ip`, never auto-retries `AUTH_BUSY` (already counted), caps raw identifier/password length before NFC, and signs out the previous token after a successful sign-in (failure ignored; cleanup covers it).
- Successes count toward 5 per identifier+IP per 15 min: E2E and screenshot runs reuse sessions or use distinct users.
- API gap: `GET /anime/lists/:kind` has no page parameter, sort, total or rank (ADR 0016 follow-up).
- Card links: `animeLink()` (`src/anime/anime-link.ts`): `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow. Always `prefetch={false}`.
- OTA-182 rollout: before web step 3, Farouk confirms privacy wording (raw client IP held ~200 s, ADR 0019). At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'` (checks in `docs/deploy-vercel.md`).
