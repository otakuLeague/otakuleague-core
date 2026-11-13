# Deploy

How the API and its database run in production. The web app (Vercel, OTA-134) is documented separately once it ships. Hosting decision: [ADR 0009](decisions/0009-hosting.md).

## Overview

- **Railway project**: `OtakuLeague`, environment `production`, region EU West (Amsterdam, `europe-west4`).
- **Services**: the API (`otakuleague-core`) and `Postgres`.
- **Web**: Vercel, not Railway (OTA-134).

## Why no railway.json

Railway's config-as-code is deprecated and stops on 2026-12-01 (per Farouk, OTA-133 comment, 2026-11-11, not re-checked by the autopilot). So the service settings live in the Railway dashboard, and this file is the source of truth for them. Change the dashboard and update this file the same day.

## API service settings

| Setting | Value |
| --- | --- |
| Source repo | `otakuLeague/otakuleague-core` |
| Branch | `main` |
| Wait for CI | On: deploys only after GitHub checks pass |
| Root directory | Repo root |
| Builder | Railpack |
| Build command | `pnpm --filter @otakuleague/api build` |
| Pre-deploy command | `pnpm --filter @otakuleague/api exec prisma migrate deploy` |
| Start command | `pnpm --filter @otakuleague/api start` |
| Health check path | `/health` |
| Watch paths | `/apps/api/**`, `/packages/shared-types/**`. A change only to the root `package.json` or `pnpm-lock.yaml` does not trigger a deploy. |
| Replicas | 1, in europe-west4 |
| Public domain | https://api-production-9cacf2d8.up.railway.app (until `api.otakuleague.com` at the launch cutover, OTA-149) |
| Private endpoint | Service named `API`; private DNS `otakuleague-core.railway.internal` |

## Variables

API service:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
| `SENTRY_DSN` | Set. The value lives only in Railway. |
| `INTERNAL_API_KEY` | Not set yet (ADR 0019). Set: every route except `/health` needs it in `X-Internal-Api-Key`. Same value on Vercel (Production). |
| `INTERNAL_API_KEY_PREVIOUS` | Unset, except during a rotation (below). Refused without `INTERNAL_API_KEY`. |

- The `DATABASE_URL` reference resolves to the private network host. Database traffic never leaves Railway and costs no egress.
- Without `INTERNAL_API_KEY` the API answers any caller and logs `INTERNAL_API_KEY is not set: the API answers any caller` once at start. Production still boots, so a missing key never blocks a deploy (until OTA-139 makes it required).
- All names are also in `.env.example`. Never write a secret value in the repo.
- Swagger UI (`/docs`) is off in production.

## Postgres service

- Image: Railway template `ghcr.io/railwayapp-templates/postgres-ssl:18`.
- Production runs 18 (Railway template default); dev and CI run 16. Farouk decides: bump dev/CI to 18 or pin production to 16 (tracked in Linear). Nothing in the schema depends on the difference today.
- Volume: `postgres-volume`, 500 MB, mounted at `/var/lib/postgresql/data`.
- No public TCP proxy. The database is reachable only over the private network.

## Plan and limits

- Plan: Railway Hobby (upgraded 2026-11-11).
- Usage limit: $10, hard. When it is reached, Railway stops the services, Postgres included.

## How a deploy works

1. Merge to `main`. CI runs, and the deploy waits for green checks.
2. If a watched path changed, Railway builds the API.
3. The pre-deploy command runs `prisma migrate deploy`.
4. The new container must answer `/health` with 200 before traffic switches.

- `/health` returns 503 while Postgres is down.
- If the build, the migration or the health check fails, the deployment is marked failed. The previous deployment keeps serving (expected behaviour, to be confirmed by the drills).
- Each migration file runs in its own implicit transaction, so a failed file is rolled back. Earlier files in the same run stay applied, and statements such as `CREATE INDEX CONCURRENTLY` are not transactional.
- A failed migration stays recorded in `_prisma_migrations`. Every later `migrate deploy` then fails with P3009 until someone runs `prisma migrate resolve --rolled-back <name>` against production (from Farouk's machine through a temporary TCP proxy, or a one-off pre-deploy command). Then fix forward with a new migration.
- The dangerous case is a migration that applies and breaks the old code still running. So migrations are additive: expand first, then contract in a later PR.

## Rollback

1. Railway dashboard → API → Deployments.
2. Pick the last good deployment.
3. Redeploy (or Rollback).

Railway keeps old images for a limited time. If Redeploy is not offered, revert the commit on `main` instead, via a PR.

A rollback does not undo migrations. Fix forward with a new migration. Never edit an applied one.

## Internal API key (ADR 0019)

Generate a key with `openssl rand -hex 32` on your own machine. Paste it only into the Railway and Vercel dashboards: never in the repo, a ticket, a chat or a URL. A wrong key on either side makes the whole site answer "service unavailable", so follow the order.

Turn it on (once the web sends the key, OTA-182 slice 2, and the Preview decision of ADR 0019 is in place):
1. Vercel → Settings → Environment Variables: `INTERNAL_API_KEY` for Production. Redeploy the web.
2. Railway → API → Variables: the same `INTERNAL_API_KEY`. Railway restarts the API; from then on the check is on.
3. Check: `curl -i <api>/anime/search?q=a` answers 403 `INTERNAL_KEY_REQUIRED`, `curl -i <api>/health` answers 200, and the site loads an anime page. The start-up warning is gone from the API logs.

Rotate (no refused request):
1. Railway: set `INTERNAL_API_KEY_PREVIOUS` to the current key and `INTERNAL_API_KEY` to the new one. The API now accepts both.
2. Vercel: set `INTERNAL_API_KEY` to the new key and redeploy the web.
3. Once that deploy is live, delete `INTERNAL_API_KEY_PREVIOUS` on Railway.

Turn it off: delete `INTERNAL_API_KEY` (and `INTERNAL_API_KEY_PREVIOUS`) on Railway first, then on Vercel. Before rolling the web back to a build older than slice 2, turn it off the same way.

## Backups

**Status as of 2026-11-11: not confirmed.** The autopilot cannot see backup schedules through the Railway tools.

- [ ] Daily and weekly volume backups enabled (Farouk). Steps: Postgres service → `postgres-volume` → Backups tab → enable the Daily schedule and the Weekly schedule. Then tick this line.
- Before relying on an on-demand backup as a safety net, check in the dashboard whether a restore creates a new volume that needs a Deploy, and whether it removes newer backups.
- Point-in-Time Recovery exists (per Railway docs): pgBackRest to a storage bucket, a weekly full backup and daily differentials, about 4 weeks of history. It costs a storage bucket, so it is not enabled. Revisit before launch.

## Restore

1. Postgres service → `postgres-volume` → Backups → choose a backup → Restore. This overwrites the current data, so first take an on-demand backup of the current state.
2. Railway restarts Postgres. `/health` answers 503 during the restart and recovers on its own (expected, to be confirmed by the drills).
3. Check that `/health` returns 200, then open one anime by slug.

Off-platform copy (untested): temporarily add a TCP proxy on the Postgres service, run `pg_dump -Fc` with a Postgres 18 client against the proxy URL, then remove the proxy. Local dev runs Postgres 18 too, so the dump restores locally.

## Deploy test plan

- [ ] `curl https://api-production-9cacf2d8.up.railway.app/health` returns 200. Seen in Railway metrics on 2026-11-11: 38 requests to `/health` in 6 hours, all 2xx.
- [ ] `curl` `/anime/anilist/154587` first. It imports Frieren; the slug lookup reads the database only, so a never-imported anime is a 404.
- [ ] Then `curl` `/anime/slugs/frieren-beyond-journeys-end` returns 200 with `kind: "anime"`.
- [ ] Failed-migration drill (not done yet; Farouk; needs a Railway PR environment or a throwaway branch service). Push a migration with invalid SQL to a test environment. Confirm the deployment fails at pre-deploy and the previous deployment keeps answering `/health` with 200. Then delete the test environment.
- [ ] Postgres restart drill. Restart the Postgres service. Confirm `/health` goes 503, then back to 200, without restarting the API.
