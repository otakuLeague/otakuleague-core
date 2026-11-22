# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-22 (OTA-207-a)
## Current milestone
W4 Accounts (OTA-139), then W5 My List. Done: catalog list API (OTA-135, 177, 190), OTA-137 slice 1, OTA-136 Home slice 1, OTA-184 slice 1 (ADR 0017), OTA-189 A–C, OTA-139 slices 1a–1f-v2b (1f-ii to 1f-v2b merged as #122–#134; OTA-139 reopened to Todo), OTA-197, 199–204, plus earlier W3/W7 slices.
## Last session
OTA-207 slice 207-a (PR open): `clientNetworkOf` in `api/client-ip.ts`; `createActionThrottleKeyer` (HMAC-SHA256) and `createActionThrottle` (fixed 60 per 60 s, 10,000 entries) in `auth/action-throttle.ts`; nothing imports them yet. Details: `docs/progress/OTA-207.md`.
## In progress
- OTA-139 (Todo): 1f-v3 sign-up form, 1f-vi verification link, 1f-vii resend and debounced availability. 1f-iv-c2 sign-out and frame headers on beta not browser-verified.
- OTA-207 PR: 207-b and 207-c open.
- OTA-205 (High) unconfirmed sign-out revocation; OTA-206 stale action id.
- OTA-197 leftovers: per-/48 IPv6 bucket + Vercel firewall rule; forged `X-Forwarded-For` spoof check on a preview.
- OTA-136 slices 2–4; OTA-147 `/contact` (needs email provider). Launch gate: DPAs, OTA-180/181/179, contact mailbox, OTA-107. Email on Resend free plan (decided 2026-11-15): 80 sign-up + 20 reset/day, Sentry alert at 75.
## Next 3 tasks
1. OTA-207-b proxy wiring (secure-builder; must land before 1f-v3 opens sign-up): `isPossibleActionPost` parity test, `proxy.ts` matcher, 429 `ACTION_THROTTLED_TEXT`, same-site 403 before counting, /48 tier at 300, loopback key on one machine only, `forgetEnded()` every pass; beta gate: 200 POSTs in 50 s, more than 60 passing means several instances. Then 207-c `SignOutForm` `throttled` state (ui-builder).
2. OTA-139 1f-v3 sign-up form: privacy `__Host-` rows (`apps/web/src/legal/privacy.tsx` ~163/168), disable submit while pending, swap a screenshot route (8/8), no "nothing was saved" copy. Then 1f-vi, 1f-vii.
3. OTA-205 unconfirmed sign-out revocation (High).
Later: OTA-186 Mailpit or OTA-184 slice 2 (Farouk decides); OTA-198 `claimsSlugs` gate decision; OTA-137 slice 2; OTA-182 slice 2b; OTA-194 (shared `currentSeason`).
## Blockers
- `WEB_PUBLIC_URL` must equal the live origin (Origin guard); /auth must never get `Referrer-Policy: no-referrer`. Farouk confirms Vercel Production `WEB_PUBLIC_URL` is `https://beta.otakuleague.com` (Preview has none) before 1f-iii deploys; runtime-proof checkpoint 2026-11-23.
- Before 1f-iii-b deploys: a forwarded Server Action hop (`x-action-forwarded`) is refused; `x-forwarded-for` is the visitor's (also on post-redirect prefetch: API `X-Client-Ip`); Vercel system env vars stay exposed.
- `AUTH_HMAC_KEY` on Railway (API): `[A-Za-z0-9_-]{43,128}`, distinct from every `INTERNAL_API_KEY*`; boot fails without it. `SHOW timezone` on Railway's Postgres must be UTC (OTA-200).
- Cloud runs: Node 22 (repo wants 24). Install with `--config.engine-strict=false --ignore-scripts`, then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 pnpm exec prisma generate`; integration via apt Postgres 16; argon2 specs fail; Google Fonts blocked: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`. Railway Node unverified: check `node -v` in build log.
- Resend account and DNS (Farouk, OTA-178) before mail sends. OTA-203 (Farouk): disable "Claude" workflow, revoke `CLAUDE_CODE_OAUTH_TOKEN`, delete `claude-ok` label, close Dependabot #112, delete ~30 merged branches holding `claude.yml`.
- Squash merges add a `Co-authored-by: Claude` trailer: cloud-run commits take `Claude <noreply@anthropic.com>` from the machine's git config, and CLAUDE.md forbids AI attribution. Farouk decides.
- OTA-207 PR, for Farouk: HMAC and privacy sentence "keyed hashes of your IP address"; 429 and `throttled` wording; 60/min per network cap and shared-NAT trade-off.
## Known bugs
- Two ADRs share 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails (no ticket).
- `next build` type check fails on main (`SeasonResultsView` export from `app/season/page.tsx`) though CI is green: check CI's build before ticketing.
- Search filter logs every 5xx with a stack, unthrottled; one visitor can take all 4 search slots. Web search must forward `clientIp` and debounce.
- Auth DTOs (sign-in, confirm) need `isWellFormed()` (lone surrogates become U+FFFD); no route test of the 30/identifier/hour ceiling; API should reuse shared `isSessionToken()`.
## Notes
- Merging (OTA-202): autopilot merges when CI is green and Fable review has no Critical; `.github/workflows/*`, `.github/actions/*`, `.github/autopilot-protected-paths` stay with Farouk. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- Sign-up gate (ADR 0020, before sign-up opens): email budget in `dispatch` before any real `EmailSender`; keyed email hash on the hold; 24 h per-email cap on unbound confirm passwords; 40P01 to 503; CHECK `expires_at > created_at`; /48 tier for sign-up and sign-in. No API rollback below 1e-ii-b once open.
- Web contracts (ADR 0020): normalised identifiers, `X-Client-Ip`, no auto-retry of `AUTH_BUSY` or resend, `ol_signup` `__Host-` set only by the sign-up action, flash always written on accepted, 401 from confirm is not a session expiry.
- Successes count toward 5 per identifier+IP per 15 min: E2E and screenshot runs reuse sessions or use distinct users. Card links: `animeLink()` gives `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow; `prefetch={false}`. OTA-139 follow-ups: gate `cookies` import to its three files; `Cache-Control` on /faq and /auth/check-email; L3, L5, L6.
- Follow-ups: `main` ruleset (PR + CI); `autopilot-merge.yml` should delete head branches; charter's "private repo" line is stale; OTA-182: Farouk confirms privacy wording, flip `SEARCH_INDEXING` at launch.
