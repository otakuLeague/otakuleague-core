# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-22 (OTA-139-v3)
## Current milestone
W4 Accounts (OTA-139), then W5 My List. Done: catalog list API (OTA-135, 177, 190), OTA-137 slice 1, OTA-136 Home slice 1, OTA-184 slice 1 (ADR 0017), OTA-189 A–C, OTA-139 slices 1a–1f-v2b (#122–#134), OTA-207 throttle for Server Action POSTs (#135, #145, #146), OTA-197, 199–204, earlier W3/W7 slices.
## Last session
OTA-139 1f-v3 (this branch): `SignUpForm` and pure `SignUpFormView` with tests, unreachable. Password empties on hide (`clearOnHide`), one submit in flight, username and email kept after a refusal. Wiring is pushed on `feat/OTA-139-sign-up-wiring`.
Merged: OTA-217 trailer stops when hidden (#144; browser check not verified), OTA-205-a sign-out-everywhere API (#137, no web caller yet), OTA-206 (#139), OTA-214 slice A (#140), OTA-215 (#141). OTA-208, 210, 211: PR state not checked.
## In progress
- OTA-139 (Todo): sign-up wiring PR opens once this PR merges; then v3b (confirm field, Show buttons, live checklist, focus after switch), 1f-vi, 1f-vii. 1f-iv-c2 sign-out and frame headers on beta not browser-verified.
- OTA-205 (High): 205-b (bounded retry in `deleteSession`) and 205-c (sign-out-everywhere button, `session_ended`); independent.
- OTA-222 (new): same `clearOnHide` on the sign-in password.
- OTA-214 slice B on its branch; OTA-215 web slice waits on OTA-216. OTA-197 leftovers: Vercel firewall rule, forged `X-Forwarded-For` spoof check on a preview. OTA-136 slices 2–4; OTA-147 `/contact` (needs an email provider).
## Next 3 tasks
1. OTA-139 sign-up wiring PR (`feat/OTA-139-sign-up-wiring`, after this PR merges). Checks owed first: `next build` with the second hole; sign-in flash on a hard load of `/auth?mode=sign-up`; `/sign-up` redirect keeps the query; `method="POST"` in served HTML. Then v3b, 1f-vi, 1f-vii.
2. OTA-222 (sign-in password `clearOnHide`) and OTA-205 205-b / 205-c.
3. OTA-207 beta gate after deploy (Farouk): 200 sign-out POSTs in 50 s; more than 60 passing means several instances, so 207-b is not the whole answer.
Later: OTA-216 (needs-human): live AniList run, re-record OTA-215 fixtures; OTA-209 (pin image URLs); OTA-212 Design: error pages mascot; Design for the empty right half of the anime header; OTA-186 Mailpit or OTA-184 slice 2 (Farouk decides); OTA-198 `claimsSlugs` gate; OTA-137 slice 2; OTA-182 slice 2b; OTA-194 (shared `currentSeason`). Launch gate: DPAs, OTA-180/181/179, contact mailbox, OTA-107.
## Blockers
- Do not configure the email sender on Railway before v3b: until then nothing catches a mistyped password.
- `WEB_PUBLIC_URL` must equal the live origin (Origin guard); /auth must never get `Referrer-Policy: no-referrer`. Farouk confirms Vercel Production is `https://beta.otakuleague.com` (Preview has none) before 1f-iii deploys; runtime-proof checkpoint 2026-11-23.
- Before 1f-iii-b deploys: a forwarded Server Action hop (`x-action-forwarded`) is refused; `x-forwarded-for` is the visitor's (also on post-redirect prefetch: API `X-Client-Ip`); Vercel system env vars stay exposed.
- `AUTH_HMAC_KEY` on Railway (API): `[A-Za-z0-9_-]{43,128}`, distinct from every `INTERNAL_API_KEY*`; boot fails without it. `SHOW timezone` on Railway's Postgres must be UTC (OTA-200).
- Cloud runs: Node 22 (repo wants 24). Install with `--config.engine-strict=false --ignore-scripts`, then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 pnpm exec prisma generate`; integration via apt Postgres 16; argon2 specs fail; Google Fonts blocked: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`.
- Resend account and DNS (Farouk, OTA-178) before mail sends. OTA-203 (Farouk): disable "Claude" workflow, revoke `CLAUDE_CODE_OAUTH_TOKEN`, delete `claude-ok` label, close Dependabot #112, delete ~30 merged branches holding `claude.yml`.
- Squash merges add a `Co-authored-by: Claude` trailer (cloud commits take it from the machine's git config; CLAUDE.md forbids AI attribution). Farouk decides.
- OTA-207 questions for Farouk: HMAC privacy sentence; 429/`throttled` wording; 60/min per network cap and shared-NAT trade-off; beta gate.
## Known bugs
- Two ADRs share 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails (no ticket).
- `next build` type check fails on main (`SeasonResultsView` export from `app/season/page.tsx`) though CI is green: check CI's build before ticketing.
- Search filter logs every 5xx with a stack, unthrottled; one visitor can take all 4 search slots. Web search must forward `clientIp` and debounce.
- Auth DTOs (sign-in, confirm) need `isWellFormed()` (lone surrogates become U+FFFD); no route test of the 30/identifier/hour ceiling; API should reuse shared `isSessionToken()`.
- Sign-out (OTA-206): a stale action id after a deploy lands in `failed` until a reload; a no-JS submit gets a 409 "Server Action unavailable."; Farouk decides on a stable-URL sign-out route.
## Notes
- Merging (OTA-202): autopilot merges when CI is green and Fable review has no Critical; `.github/workflows/*`, `.github/actions/*`, `.github/autopilot-protected-paths` stay with Farouk. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- Sign-up gate (ADR 0020, before sign-up opens): email budget in `dispatch` before any real `EmailSender`; keyed email hash on the hold; 24 h per-email cap on unbound confirm passwords; 40P01 to 503; /48 tier for sign-up and sign-in. No API rollback below 1e-ii-b once open.
- Web contracts (ADR 0020): normalised identifiers, `X-Client-Ip`, no auto-retry of `AUTH_BUSY` or resend, `ol_signup` `__Host-` set only by the sign-up action, 401 from confirm is not a session expiry.
- Successes count toward 5 per identifier+IP per 15 min: E2E and screenshot runs reuse sessions or use distinct users. Card links: `animeLink()` gives `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow; `prefetch={false}`.
- Follow-ups: `main` ruleset (PR + CI); `autopilot-merge.yml` should delete head branches; charter's "private repo" line is stale; OTA-182: Farouk confirms privacy wording, flip `SEARCH_INDEXING` at launch; OTA-139: gate `cookies` import to its three files, `Cache-Control` on /faq and /auth/check-email, L3, L5, L6.
