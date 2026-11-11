# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W1 Live skeleton (Nov 2–8) is overdue. Done: OTA-97, OTA-134, OTA-163 (real-page screenshots on every web PR, #52). API and Postgres live on Railway (OTA-133 docs PR #50 open, green). W2: designs merged; OTA-152 slice 1 merged, slice 2a (guest desktop header) in PR #53.

## Last session
Autopilot on OTA-152 slice 2a (branch `feat/OTA-152-header-menus`, ADR 0014). Guest desktop header in `apps/web/src/shell/`: `nav.ts` (link data, `activeSection`), `disclosure.tsx` (native `<details name="sh-menu">` enhanced to close on Esc, outside click, focus leaving, link click), `header-nav.tsx` (client, `usePathname` inside `Suspense`), `site-header.tsx` (server: logo, GET search form, Sign in/up). Search box hidden below 1100 px so the header fits at 768 px; below 768 px only logo and Sign in until the mobile sheet. `overflow-x: clip` keeps the header sticky; the anime sticky bar sits under the header and its observer uses `--header-h` as root margin. Discover panel is a solid surface (nested backdrop-filter does not blur). Links to unbuilt routes use `prefetch={false}` and 404 for now. Header adds ~1.1 kB gzipped JS.

## In progress
- OTA-152: slice 2a PR #53. Remaining slices: 2b member state (`ShellViewer` union, account menu, skip link), mobile sheet + mobile search (Base UI, `package.json` → Farouk merges), hide shell on `/auth*` and `/onboarding` (route groups), 404/500 restyle, social icons.
- OTA-133: docs PR #50.

## Next 3 tasks
1. OTA-152 slice 2b (member state and account menu).
2. OTA-100 Overview tab (unblocked), or OTA-166 vendored design skills (protected path, Farouk merges). Page reports now use the real CI screenshots (OTA-163).
3. After PR #50 merges: link `docs/deploy-vercel.md` from ADR 0009 and architecture.md.

## Blockers
- OTA-168 (needs-human): Postgres volume backups, deploy drills, Postgres 18 vs 16.
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked, so the normal web build fails here; `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. API checks rely on CI. The proxy also blocks `*.up.railway.app` and `beta.otakuleague.com`.

## Known bugs
- `Cover` has no fallback when an image fails to load (visible in CI screenshots, where CDN images are blocked). No ticket yet.

## Notes
- OTA-160 decided (logo "Pierce", hero "Calm night", CSS/SVG only for v1): OTA-153 Home design is unblocked.
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 (TypeScript 7 / ESLint 10) stays red until typescript-eslint and Next's ESLint plugins support them; never auto-merged.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use teal. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
