# Progress (handoff)
Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-13

## Current milestone
W3 Browse. Done on main: catalog list API slices 1–3 (OTA-135, OTA-177 seasonal + genre lists, OTA-190 slug claiming), OTA-173/174 import guards, design skills OTA-166/188, React review checklist OTA-185 (`.claude/rules/web.md`), OTA-136 Home page slice 1 (static hero, three uncached catalog rows; see `docs/progress/OTA-136.md`).

## Last session
OTA-137 Browse list pages slice 1 (PR open, draft): shared list template and `/season`. Draft until Farouk decides the OTA-189 launch gate (`docs/progress/OTA-137.md`).

## In progress
- OTA-137 slice 1 PR (draft): merge after OTA-189, or amend ADR 0016 to accept the interim controls (robots `Disallow: /season?`, nofollow, no prefetch, page cap 10).
- OTA-136 slices 2–4: features + "Coming after launch" + sign-up band; card meta, season name, Retry, row arrows/fade/bleed; Logo component, hero sky + motion island, `--ease-drift` in tokens, hide `.sh-bg` on home.
- OTA-147 remaining: `/contact` (needs the email provider). Launch gate: DPAs, account-deletion wording (OTA-180/181), Google sign-in text (OTA-179), contact mailbox host, AnimeThemes credit (OTA-107).

## Next 3 tasks
1. OTA-189 per-client rate limit: unblocks `/season` going public. It must limit at the web edge, because `apps/web/src/api/client.ts` forwards no client identity (security reviewer).
2. OTA-137 slice 2: season picker, `/top/anime`.
3. OTA-136 slice 2.
Later: OTA-191 nofollow id links for never-imported anime; OTA-192 `imported_at` marker; lift OTA-190's claim scope after OTA-189; OTA-194 (Show-more pending state + focus, shared `currentSeason`, card helpers move).

## Blockers
- Cloud runs have Node 22 (repo wants 24): `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. No Prisma engines in cloud runs: API lint/typecheck/tests and integration specs run in CI only.
- Google Fonts blocked in cloud runs: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs; `scripts/screenshots/fake-sources.mjs` doesn't replay list queries (home rows screenshot as failed). Both are protected-path fixes.
- ADR 0015 auth needs Brevo account and DNS (Farouk) before OTA-139 email flows.

## Known bugs
- Two ADRs share number 0016 (`0016-anime-search`, `0016-catalog-lists`): renumber one.
- `Cover` has no fallback when an image fails to load. No ticket yet.
- Search rank timeout (57014) returns 500, not 503.

## Notes
- Merging: autopilot PRs merge per OTA-176; everything else Farouk merges. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file.
- API gap: `GET /anime/lists/:kind` has no page parameter, sort, total or rank (ADR 0016 follow-up).
- Card links: always `prefetch={false}` and, until OTA-189/191, `rel="nofollow"` (claimed slugs trigger cold imports). Confirm `ANIME_GENRES` with `{ GenreCollection }` when fixtures are re-recorded.
- Follow-ups: `.claude/rules/web.md` line for the vendored Impeccable/react-best-practices skills; ADR 0011 addendum (Impeccable vendored); after OTA-184 lands, name its query hooks in the React checklist.
- OTA-153 answers (Farouk): Pierce mark in the header site-wide; leaderboard per season; Trending reuses Top airing. Design follow-ups: focus rings use `--accent-ink`; add `--medal-2/3` and `--ls-*` to `tokens.css`.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
