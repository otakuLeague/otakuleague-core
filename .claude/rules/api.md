---
paths:
  - "apps/api/**"
---
# API with the database (moved from CLAUDE.md)

The API loads the repo-root `.env` (real env vars win) and refuses to boot, exit code 1, with one message listing every missing or invalid variable (`NODE_ENV`, `PORT`, `DATABASE_URL`).
1. `cp .env.example .env` (an older `.env` needs `NODE_ENV=development` added), then `pnpm db:up`.
2. `pnpm db:migrate` (runs `prisma migrate deploy` in the API): apply migrations to the dev DB (`prisma migrate status` to check).
3. `pnpm dev`, or `pnpm build && pnpm --filter @otakuleague/api start`.
4. `curl localhost:3001/health`: 200 `{"status":"ok",...}`, or 503 while Postgres is down (the API keeps running and recovers by itself). Swagger UI at `/docs`, JSON at `/docs-json`, both off when `NODE_ENV=production`.
- Prisma CLI: run it inside apps/api (`pnpm --filter @otakuleague/api exec prisma ...`); `pnpm install` regenerates the client into `apps/api/src/generated` (gitignored). After a schema change: `prisma migrate dev --name <change>`, then `prisma generate`.
- Migrations: `migrate dev` only against the dev DB; `migrate deploy` for production; the integration suite migrates the test DB itself. Never edit an applied migration; add a new one.
- Unit tests point `DATABASE_URL` at a closed port; anything that queries Postgres is a `*.integration.spec.ts`. Copy `apps/api/src/testing/example.integration.spec.ts` (inject `Clock` and `Random`, never `new Date()` or `randomUUID()`). If Postgres is down the integration suite stops with "Run `pnpm db:up`"; "Another integration run is using ..." means two runs overlap.
