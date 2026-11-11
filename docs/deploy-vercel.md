# Vercel deploy (web)

Settings live in the Vercel dashboard (no `vercel.json`). Change the dashboard and this file the same day.

## Project

| Setting | Value |
| --- | --- |
| Project | `otakuleague` (Hobby plan) |
| Repo | `otakuleague-core` (public: Hobby cannot deploy private org repos) |
| Root directory | `apps/web` |
| Node | 24.x |
| Functions region | `cdg1` (Paris) |
| Production branch | `main` |
| Production URLs | `otakuleague-core.vercel.app`, `beta.otakuleague.com` |
| Preview | every PR gets a preview URL (Vercel bot comment) |

DNS is at Namecheap: CNAME `beta` -> `1c6706ddfc32ce8d.vercel-dns-017.com`.

## Build command

`pnpm --filter @otakuleague/shared-types build && pnpm run build`

With a cached install, the workspace `prepare` step that builds `shared-types` was skipped, and previews failed with `Can't resolve '@otakuleague/shared-types'`. Building it explicitly makes the build independent of the install cache.

## Variables

| Variable | Value | Environments | Notes |
| --- | --- | --- | --- |
| `API_BASE_URL` | `https://api-production-9cacf2d8.up.railway.app` | Production, Preview | Server-only |
| `NEXT_PUBLIC_SENTRY_DSN` | not set yet | n/a | OTA-167 |

## Search indexing

`beta.otakuleague.com` is the production deploy of `main`, so `VERCEL_ENV` cannot tell the beta from the future real site. Indexing is driven by one constant, `SEARCH_INDEXING` in `apps/web/src/seo/indexing.ts`, currently `'blocked'`. It sets the root `metadata.robots` in `apps/web/app/layout.tsx`, which renders `<meta name="robots" content="noindex, nofollow">` on every page.

There is no `Disallow: /` in a robots.txt on purpose: a crawler that cannot fetch a page never sees its noindex.

At the launch cutover (OTA-149): change the constant to `'allowed'`, merge, and check the meta tag is gone from the real domain (`curl -s <url> | grep robots` shows `index, follow` or nothing).

## Test plan

1. Open a PR preview URL (from the Vercel bot comment).
2. Load `/anime/attack-on-titan`: the page renders.
3. Request an alias slug (a slug other than the canonical one, or the same slug in another letter case): `curl -I <preview>/anime/<alias>` returns `308` with `location` pointing to the canonical slug (handled by `apps/web/proxy.ts`).
4. `curl -s <preview>/anime/attack-on-titan | grep robots` shows `<meta name="robots" content="noindex, nofollow">`.
5. An unknown slug returns a real `404`.

Preview URLs may be protected by Vercel authentication; if `curl` gets a login page, use the beta domain after merge instead.
