# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-13

## Current milestone
W3 Browse. Done on main: catalog list API slices 1–3 (OTA-135, OTA-177 seasonal + genre lists, OTA-190 slug claiming), OTA-173/174 import guards, design skills OTA-166/188, React review checklist OTA-185 (`.claude/rules/web.md`).

## Last session
OTA-136 Home page slice 1 (PR open): static hero + three uncached catalog rows with per-row states; health status removed from home. See `docs/progress/OTA-136.md`.

## In progress
- OTA-136 slices 2–4: features + "Coming after launch" + sign-up band; card meta, season name, Retry, row arrows/fade/bleed; Logo component, hero sky + motion island, `--ease-drift` in tokens, hide `.sh-bg` on home.
- OTA-147 remaining: `/contact` (needs the email provider). Launch gate: DPAs, account-deletion wording (OTA-180/181), Google sign-in text (OTA-179), contact mailbox host, AnimeThemes credit (OTA-107).

## Next 3 tasks
1. OTA-137 Build Seasonal, Rankings, Discover list pages (reuse `apps/web/app/styles/browse.css`, `src/home/home-rows.ts` card helpers). OTA-189 per-client limit must ship before the Seasonal page is public.
2. OTA-136 slice 2.
3. OTA-191 nofollow id links for never-imported anime; OTA-192 `imported_at` marker. Lift OTA-190's claim scope after OTA-189.

## Blockers
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. No Prisma engines in cloud runs: API lint/typecheck/tests and integration specs run in CI only.
- Google Fonts blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs; `scripts/screenshots/fake-sources.mjs` doesn't replay list queries (home rows screenshot as failed). Both are protected-path fixes.
- ADR 0015 auth needs Brevo account and DNS (Farouk) before OTA-139 email flows.

## Known bugs
- Two ADRs share number 0016 (anime-search, catalog-lists): renumber one.
- `Cover` has no fallback when an image fails to load. No ticket yet.
- Search rank timeout (57014) returns 500, not 503.

## Notes
- Merging: autopilot-labelled PRs merge per OTA-176; protected paths and everything else Farouk merges. `max_open_prs` is 6.
- Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- Card links: always `prefetch={false}` and, until OTA-189/191, `rel="nofollow"` (claimed slugs trigger cold imports). Confirm `ANIME_GENRES` with `{ GenreCollection }` when fixtures are re-recorded.
- Follow-ups: `.claude/rules/web.md` line for the vendored Impeccable/react-best-practices skills; ADR 0011 addendum (Impeccable vendored); after OTA-184 lands, name its query hooks in the React checklist.
- OTA-153 answers (Farouk): Pierce mark in the header site-wide; leaderboard per season; Trending reuses Top airing. Design follow-ups: focus rings use `--accent-ink`; add `--medal-2/3` and `--ls-*` to `tokens.css`.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
