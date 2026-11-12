# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Done: OTA-152 shell, OTA-97 anime page shell. Merged: OTA-172 season id route (#57), OTA-153 Home design (#59), OTA-100 Overview tab slice 1 (#58), OTA-171 design direction (#56).

## Last session
Autopilot on OTA-153 (branch `design/OTA-153-home-page`). Home mockups in `docs/design/home/` (Main, Mobile, Light, SignedIn, Poster, Loading, Error) with `motion.md` and `README.md`; Pierce logo SVGs in `apps/web/public/brand/` (full, light-ground, small mark). Hero = "Calm night" with radial-gradient glows (no `filter: blur`) and an opacity sheen instead of a rotating gradient; motion paused until a client island allows it. LCP = hero `h1`, static. Shared row scroller in `docs/design/browse/browse.css` now bleeds to the edge with a gutter-capped fade, desktop ‹ › buttons and one-line card meta. Row and XP slots keep one height across loaded/loading/error/empty (no CLS).

## In progress
- OTA-152 remaining slices: 2b member state, mobile sheet + search (Base UI, `package.json` → Farouk merges), hide shell on `/auth*` and `/onboarding`, 404/500 restyle, social icons.
- OTA-100 slice 1 (#58, merged): synopsis, details card, genre chips via `overviewFacts()` in `src/anime/overview-facts.ts`. Only an AniList synopsis is shown until OTA-127 clears MAL terms. Next slices: tags + spoiler toggle, trailer + where to watch, next-episode card, tab previews.

## Next 3 tasks
1. OTA-136 Build: Home page (unblocked once this PR merges): Logo component (unique gradient ids), motion island, `--ease-drift` into tokens.css, hide `.sh-bg` on home, browse row changes.
2. OTA-98 Build: search, or OTA-152 slice 2b.
3. OTA-166 vendored design skills (protected path, Farouk merges), or OTA-173 (W7): API guard against id enumeration triggering imports, from the OTA-172 security review.

## Blockers
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked; `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs (installed under `/opt/node-tools/node_modules`, ESM ignores `NODE_PATH`): run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.

## Known bugs
- `Cover` has no fallback when an image fails to load. No ticket yet.

## Notes
- OTA-172: seasons without a slug link to `app/anime/anilist/[id]/[[...tab]]`, which redirects to the canonical slug; because `loading.tsx` streams, a direct hit is HTTP 200 with a meta refresh, never a real 307/404 (see `.claude/rules/web.md`).
- New from the OTA-100 review: OTA-174 (cap source text size in the API).
- OTA-153 answers (Farouk, 2026-11-12, also on OTA-136): Pierce mark in the header site-wide now; leaderboard per season; Trending reuses Top airing.
- Merging: the cloud permission check blocks the autopilot from adding `automerge`, so Farouk labels or merges every PR; `max_open_prs` is 6 (OTA-175).
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 stays red until typescript-eslint and Next's ESLint plugins support TS 7 / ESLint 10.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide.
- Design direction (ADR 0012 addendum, 2026-11-11): the look need not match the old site. Bolder identity, richer motion and dynamic pages are welcome (motion-first references listed there); PARITY.md covers features only. ADR 0011 performance rules still apply.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
