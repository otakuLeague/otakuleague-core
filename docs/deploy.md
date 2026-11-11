# Deploy

How the API and its database run in production. The web app (Vercel, OTA-134) is documented separately once it ships. Hosting decision: [ADR 0009](decisions/0009-hosting.md).

## Overview

- **Railway project**: `OtakuLeague`, environment `production`, region EU West (Amsterdam, `europe-west4`).
- **Services**: the API (`otakuleague-core`) and `Postgres`.
- **Web**: Vercel, not Railway (OTA-134).

## Why no railway.json

Railway's config-as-code is deprecated and stops on 2026-12-01 (Farouk, 2026-11-11). So the service settings live in the Railway dashboard, and this file is the source of truth for them. Change the dashboard and this file in the same PR.

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
| Watch paths | `/apps/api/**`, `/packages/shared-types/**` |
| Replicas | 1, in europe-west4 |
| Public domain | https://api-production-9cacf2d8.up.railway.app (until `api.otakuleague.com` at the launch cutover, OTA-149) |
| Private endpoint | `otakuleague-core` |

## Variables

API service:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
| `SENTRY_DSN` | Set. The value lives only in Railway. |

- The `DATABASE_URL` reference resolves to the private network host. Database traffic never leaves Railway and costs no egress.
- All names are also in `.env.example`. Never write a secret value in the repo.
- Swagger UI (`/docs`) is off in production.

## Postgres service

- Image: Railway template `ghcr.io/railwayapp-templates/postgres-ssl:18`.
- Production runs Postgres 18, while local Docker and CI use 16 (CLAUDE.md). Open question: nothing in the schema depends on the difference today. See the addendum in [ADR 0009](decisions/0009-hosting.md).
- Volume: `postgres-volume`, 500 MB, mounted at `/var/lib/postgresql/data`.
- No public TCP proxy. The database is reachable only over the private network.

## Plan and limits

- Plan: Railway Hobby (upgraded 2026-11-11).
- Usage limit: $10, hard.

## How a deploy works

1. Merge to `main`. CI runs, and the deploy waits for green checks.
2. If a watched path changed, Railway builds the API.
3. The pre-deploy command runs `prisma migrate deploy`.
4. The new container must answer `/health` with 200 before traffic switches.

- `/health` returns 503 while Postgres is down.
- If the build, the migration or the health check fails, the deployment is marked failed. The previous deployment keeps serving.
- `prisma migrate deploy` applies each migration in a transaction where Postgres allows it. A failed migration then leaves the schema as it was.
- The dangerous case is a migration that applies and breaks the old code still running. So migrations are additive: expand first, then contract in a later PR.

## Rollback

1. Railway dashboard → API → Deployments.
2. Pick the last good deployment.
3. Redeploy (or Rollback).

A rollback does not undo migrations. Fix forward with a new migration. Never edit an applied one.

## Backups

**Status as of 2026-11-11: not confirmed.** The autopilot cannot see backup schedules through the Railway tools.

- [ ] Daily and weekly volume backups enabled (Farouk). Steps: Postgres service → `postgres-volume` → Backups tab → enable the Daily schedule and the Weekly schedule. Then tick this line.
- Point-in-Time Recovery exists: pgBackRest to a storage bucket, a weekly full backup and daily differentials, about 4 weeks of history. It costs a storage bucket, so it is not enabled. Revisit before launch.

## Restore

1. Postgres service → `postgres-volume` → Backups → choose a backup → Restore. This overwrites the current data, so first take an on-demand backup of the current state.
2. Railway restarts Postgres. `/health` answers 503 during the restart and recovers on its own.
3. Check that `/health` returns 200, then open one anime by slug.

Off-platform copy: run `pg_dump` through `railway connect Postgres` from Farouk's machine (needs the Railway CLI). Restore with `pg_restore` into a fresh Postgres.

## Deploy test plan

- [ ] `curl https://api-production-9cacf2d8.up.railway.app/health` returns 200. Seen in Railway metrics on 2026-11-11: 38 requests to `/health` in 6 hours, all 2xx.
- [ ] `curl` `/anime/slugs/<slug>` for one known anime, e.g. `/anime/slugs/frieren-beyond-journeys-end`, returns 200 or a redirect body.
- [ ] Failed-migration drill (not done yet; Farouk; needs a Railway PR environment or a throwaway branch service). Push a migration with invalid SQL to a test environment. Confirm the deployment fails at pre-deploy and the previous deployment keeps answering `/health` with 200. Then delete the test environment.
- [ ] Postgres restart drill. Restart the Postgres service. Confirm `/health` goes 503, then back to 200, without restarting the API.
