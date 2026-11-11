# 0009: Hosting: Vercel for the web, Railway for the API and Postgres

Status: accepted (2026-10-31, OTA-132). Implemented by OTA-133 (API) and OTA-134 (web).

## Context
Two deployable services (ADR 0001) and one Postgres. The owner is in Paris and so are most expected users. Budget: "reasonable" monthly cost, free where it doesn't hurt. Needs: always-on API (franchise walks run in the background, ADR 0008), preview deploys per PR, deploy only after CI is green, EU data location (GDPR, accounts from W4).

Prices checked 2026-10-31 (vercel.com/pricing, docs.railway.com/reference/pricing, neon.com/pricing).

## Options
- **Vercel (web) + Railway (API + Postgres).** Vercel is the reference platform for Next.js (Partial Prefetching, `proxy.ts`, image optimisation, previews). Railway runs a long-lived Node process and Postgres in the same private network, auto-deploys from GitHub and can wait for CI.
- **Vercel + Render.** Predictable instance pricing, but the free Postgres expires after 30 days and the free web service sleeps.
- **Vercel + Neon (DB) + Fly/Railway (API).** Neon's free tier (1 GB, scale-to-zero) is generous, but it adds a third vendor, a cold start on the first query after idle, and cross-provider latency.
- **One VPS with Docker.** Cheapest at scale, but we'd own patching, TLS, backups and previews: a poor use of 10 h/week.

## Decision
- Web: **Vercel**, project root `apps/web`, functions in an EU region next to the API. **Hobby (free) until the site earns money**; Vercel's Hobby plan is for non-commercial use only, so move to **Pro ($20/month)** before adding ads, donations or paid features.
- API + DB: **Railway Hobby ($5/month, includes $5 of usage)**, EU region, Postgres in the same project over the private network, "Wait for CI" on, `prisma migrate deploy` as the pre-deploy step, health check `/health`.
- Domains: `beta.otakuleague.com` until launch, then `otakuleague.com` / `www` → Vercel and `api.otakuleague.com` → Railway (OTA-149).
- Errors: Sentry free tier (ADR 0004). Email: chosen in the auth ADR (OTA-138).

## Consequences
- Expected cost at launch: about **$5–15/month** (Railway usage above the included $5 is metered by RAM/CPU/volume), plus the domain renewal you already pay. +$20/month the day the site monetises.
- Previews: Vercel gives each PR a URL; those previews call the production API unless a Railway PR environment is added later.
- Railway's bill is usage-based: set a usage limit in its dashboard so a runaway process can't surprise you.
- Moving off later is cheap: both apps are plain Node builds and the DB is vanilla Postgres (`pg_dump`).

## Learnings
Free tiers differ more by licence and sleep behaviour than by quota: check "commercial use" and "does it sleep" first.

## Addendum (OTA-133, 2026-11-11)
- Service settings live in the Railway dashboard, because `railway.json` is deprecated and stops 2026-12-01. [docs/deploy.md](../deploy.md) is the source of truth.
- Production Postgres is 18 (Railway template). Dev and CI use 16.
- The usage limit on Hobby is $10, hard.
