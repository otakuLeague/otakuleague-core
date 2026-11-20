# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-20
## Current milestone
W4 Accounts (OTA-139), then W5 My List. Done: catalog list API (OTA-135, 177, 190), OTA-137 slice 1, OTA-136 Home slice 1, OTA-184 slice 1 (ADR 0017), OTA-189 A–C, OTA-139 slices 1a–1e-i, OTA-197, 199–204, plus earlier W3/W7 slices.
## Last session
OTA-139 slice 1e-ii-a: `POST /auth/email-verification/confirm` + pre-hijack gate (unbound confirm needs the password), ADR 0020 Addendum. Before: 1e-i sign-up (#116), OTA-203 removed `claude.yml` (#115).
## In progress
- OTA-139 1e-ii-a: PR open on `feat/OTA-139-confirm-resend`.
- OTA-197 leftovers: per-/48 IPv6 bucket + Vercel firewall rule; forged `X-Forwarded-For` spoof check on a preview.
- OTA-136 slices 2–4; OTA-147 `/contact` (needs email provider). Launch gate: DPAs, OTA-180/181/179, contact mailbox, OTA-107.
- Email on Resend free plan only (decided 2026-11-15): 80 sign-up + 20 reset/day, Sentry alert at 75; ADR 0015 addendum in the email slice.
## Next 3 tasks
1. OTA-139 1e-ii-b: resend (never moves `pending_expires_at` or the hold; copies the old binding; token expires at the row's deadline) + migration UNIQUE(`user_id`, `purpose`) on `auth_token`.
2. OTA-139 1e-iii: `GET /users/availability`, 10,000 common-password list (licence check first).
3. OTA-139 1f: web side (cookie, Server Actions, pages), ADR 0003 addendum; web contracts in ADR 0020. Then OTA-186 Mailpit + seed accounts.
Later: OTA-198 `claimsSlugs` gate decision; OTA-137 slice 2; OTA-182 slice 2b; OTA-194 follow-up (shared `currentSeason`).
## Blockers
- Runtime-proof checkpoint 2026-11-23 (needs OTA-139 1a–1f merged).
- `AUTH_HMAC_KEY` on Railway (API): `[A-Za-z0-9_-]{43,128}`, distinct from every `INTERNAL_API_KEY*`; boot fails without it.
- Run `SHOW timezone` on Railway's Postgres; if it was ever not UTC, stored rows are shifted (OTA-200).
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 pnpm exec prisma generate` makes API lint/typecheck/unit runnable. Integration: apt Postgres 16 in /var/tmp, migrations via psql (argon2 specs fail on Node 22).
- Google Fonts blocked in cloud: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`.
- Resend account and DNS (Farouk, OTA-178) before mail sends. Farouk decides OTA-184 slice 2.
- Railway Node version unverified: check `node -v` in the build log; consider refusing boot in production when `crypto.argon2` is missing.
- OTA-203 (Farouk): disable the "Claude" workflow, delete/revoke `CLAUDE_CODE_OAUTH_TOKEN`, delete `claude-ok` label, close Dependabot #112, delete ~30 merged branches still holding `claude.yml`.
## Known bugs
- Two ADRs share number 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails to load (no ticket).
- `next build` type check fails on main (`SeasonResultsView` export from `app/season/page.tsx`) though CI is green: check CI's build before ticketing.
- Search filter logs every 5xx with a stack, unthrottled; one visitor can take all 4 search slots. The web search page must forward `clientIp` and debounce.
- Auth DTOs (sign-in, confirm): need an `isWellFormed()` check (lone surrogates become U+FFFD); no route test yet of the 30 per identifier per hour ceiling. 43-char session-token pattern is copied in 3 places.
## Notes
- Merging (OTA-202): autopilot merges once CI is green and the matching Fable review has no Critical. `.github/workflows/*`, `.github/actions/*` and `.github/autopilot-protected-paths` stay with Farouk. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- Production sign-up Gate (ADR 0020): email budget, common-password list, keyed email hash on the hold, reserved-username list, UNIQUE(`user_id`, `purpose`), 24 h per-email cap on unbound confirm passwords. Also: map Postgres 40P01 to 503; CHECK `expires_at > created_at`.
- Web contracts for 1f: in ADR 0020 (normalised identifiers, `X-Client-Ip`, no auto-retry of `AUTH_BUSY`, `ol_signup` `__Host-` set only by the sign-up action, copy per route not per code, 401 from confirm is not a session expiry).
- Successes count toward 5 per identifier+IP per 15 min: E2E and screenshot runs reuse sessions or use distinct users.
- Card links: `animeLink()`: `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow; `prefetch={false}`. API gap: `GET /anime/lists/:kind` has no page/sort/total.
- Follow-ups: `main` ruleset (PR + CI); `autopilot-merge.yml` should delete head branches; charter's "private repo" line is stale. OTA-182: Farouk confirms privacy wording before web step 3; flip `SEARCH_INDEXING` at launch.
