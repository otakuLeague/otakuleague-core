# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.
Updated: 2026-11-14

## Current milestone
W3 Browse. Done on main: catalog list API slices 1–3 (OTA-135, OTA-177, OTA-190 slug claiming), OTA-137 slice 1 (`/season`), OTA-136 Home slice 1, OTA-173/174 import guards, OTA-148 robots/sitemap/canonicals, OTA-182 web→API shared key + per-visitor import limit, OTA-191 `imported` flag + nofollow id links, OTA-192 `imported_at` marker, OTA-184 slice 1 (ADR 0017), OTA-194 show-more pending state and focus, design skills OTA-166/188, React checklist OTA-185.

## Last session
OTA-170 nightly encrypted Postgres backup (PR open, `docs/progress/OTA-170.md`). Farouk merges (protected path).

## In progress
- OTA-170 PR (open): merge, run once via workflow_dispatch, restore drill (see `docs/deploy.md` Backups).
- OTA-136 slices 2–4: features + "Coming after launch" + sign-up band; card meta, season name, Retry, row arrows/fade/bleed; Logo, hero sky + motion island, `--ease-drift` in tokens, hide `.sh-bg` on home.
- OTA-147: `/contact` (needs email provider). Launch gate: DPAs, OTA-180/181/179 wording, contact mailbox, AnimeThemes credit (OTA-107).

## Next 3 tasks
1. OTA-139 sign-up slice 1 once its blockers are Done (check OTA-155/OTA-138).
2. OTA-189 per-client rate limit (High, W7): unblocks `/season` going public. Must limit at the web edge: `apps/web/src/api/client.ts` forwards no client identity.
3. OTA-186 local dev Mailpit + seed accounts (High, W4), after OTA-139.
Later: OTA-137 slice 2 (season picker, `/top/anime`); OTA-182 slice 2b (web reports a refused key, 403 `INTERNAL_KEY_REQUIRED`, to Sentry, shows "service unavailable"); lift OTA-190's claim scope after OTA-189; OTA-194 follow-up: shared `currentSeason` in shared-types (delete the web and API copies, one PR with a deploy-order note).

## Blockers
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. No Prisma engines in cloud runs: API lint/typecheck/tests and integration specs run in CI only.
- Google Fonts blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`; proxy blocks `*.up.railway.app`, `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs; `scripts/screenshots/fake-sources.mjs` doesn't replay list queries (home rows screenshot as failed). Both are protected-path fixes.
- OTA-139 now only blocked by its design/ADR tickets. Brevo account and DNS (Farouk, OTA-178) still needed before it sends mail; it blocks OTA-184 slice 2. Farouk decides OTA-184 slice 2: failed +1 (inline + Retry per design, not toast) and the `URL.parse` Safari 18 / Chrome 126 floor.
- Fable-model agents hit their usage limit 2026-11-14; autopilot ran code-reviewer/security-reviewer on Sonnet (still a different model than the Opus writer).

## Known bugs
- Two ADRs share number 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails to load (no ticket). Search rank timeout (57014) returns 500, not 503.

## Notes
- Merging: autopilot PRs merge per OTA-176; everything else Farouk merges. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- API gap: `GET /anime/lists/:kind` has no page parameter, sort, total or rank (ADR 0016 follow-up).
- Card links: `animeLink()` (`src/anime/anime-link.ts`): `/anime/<slug>` only when `imported`, else `/anime/anilist/<id>` nofollow. Always `prefetch={false}`. Confirm `ANIME_GENRES` with `{ GenreCollection }` on fixture re-record.
- OTA-182 rollout: before web rollout step 3, Farouk confirms privacy-page wording (raw client IP held in API memory ~200 s for rate limiting, ADR 0019).
- Follow-ups: Lighthouse vs old site; anime sitemap needs a DB-only paginated endpoint (ADR 0018); `.claude/rules/web.md` vendored-skills line; ADR 0011 addendum; after OTA-184, name its hooks in the React checklist.
- OTA-153 answers (Farouk): Pierce mark site-wide; leaderboard per season; Trending reuses Top airing. Focus rings use `--accent-ink`; add `--medal-2/3`, `--ls-*` to `tokens.css`.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`. Redirect or detach beta.otakuleague.com, then submit the sitemap in Search Console.
