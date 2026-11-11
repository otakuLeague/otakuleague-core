---
paths:
  - "apps/api/prisma/**"
  - "apps/api/prisma.config.ts"
  - "apps/api/src/prisma/**"
  - "apps/api/src/testing/**"
  - "apps/api/src/**/*.integration.spec.ts"
  - "docker-compose.yml"
  - "docker/**"
  - ".env.example"
---
# Database (moved from CLAUDE.md)

Requires Docker. First time: `cp .env.example .env` (until `.env` exists, Compose stops with "required variable ... is missing a value").
- `pnpm db:up`: start PostgreSQL 18 detached and wait until healthy. Dev DB `POSTGRES_DB`, test DB `POSTGRES_TEST_DB`, bound to 127.0.0.1 only.
- `pnpm db:down`: stop the container, keep the data.
- `pnpm db:reset`: delete the data volume and start fresh; the init script recreates the test DB.
- `pnpm db:logs`: follow the database logs.
- Port conflict ("port is already allocated" / "address already in use"): set `POSTGRES_PORT` in `.env` (e.g. 5433) and update the port in `DATABASE_URL` and `DATABASE_URL_TEST`, then `pnpm db:up`.
- Leftover volume (`db:up` ends with "container ... is unhealthy" because the test DB is missing, or the logs say "database files are incompatible with server" after a version change): init scripts only run on an empty volume, so run `pnpm db:reset`. This deletes all local data.
