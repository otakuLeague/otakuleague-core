# 0005: Integration tests against a real PostgreSQL
Status: accepted (2026-10-14, OTA-78)

## Context
The charter forbids mocking the data layer. Vitest runs test files in parallel (OTA-82), so tests sharing the test database could see or delete each other's rows. A crashed run can leave data behind. The old "unit" suite already needed Postgres for one test (`GET /health` with the database up), and CI ran it with a database it did not otherwise need. The schema has no tables yet, so the setup has to work before the first model lands.

## Options
Measured on the local Docker Postgres 16, integration suite of 4 files, 3 runs each:

| Isolation | Measured | Rejected because |
|---|---|---|
| **One database per test file, cloned from a migrated template** (chosen) | `CREATE DATABASE ... TEMPLATE`: 15–60 ms, 4 concurrent clones OK. Suite: 1.6 s parallel | |
| `fileParallelism: false`, one shared database, truncate between tests | Same suite serial: 2.85 s. Unit suite (9 files) serial 4.4 s vs 1.3 s parallel: each file costs ~0.3 s of imports (Nest), paid one after the other | Grows ~0.3 s per file, forever; a missed truncate leaks rows into the next file |
| One schema per file | Needs `prisma migrate deploy` per schema: one CLI process per file (seconds each) | Slower than cloning, and every query must target the right schema |
| Transaction rolled back per test | | The app runs its own Prisma pool behind HTTP: a test cannot hold the request's transaction open. Would need a test-only client wrapper around every service |

## Decision
- `*.integration.spec.ts` run with `pnpm test:integration` (`vitest.integration.config.mts`), everything else with `pnpm test`. Same command locally and in CI.
- **Before the suite** (`src/testing/integration-global-setup.ts`): take a Postgres advisory lock, drop and recreate the `DATABASE_URL_TEST` database (the template), drop clones left by a crashed run, `prisma migrate deploy` the template. A migration failure throws with Prisma's output and no test runs. Recreating the template every run means no failed migration, stray row or half-applied state survives a run.
- **Before each file** (`src/testing/integration-setup.ts`): clone the template into `<template>_file_<VITEST_WORKER_ID>` and point `DATABASE_URL` at it; drop it after the file. Two files never share a database, so parallel files cannot see each other's rows. `isolation-a/b.integration.spec.ts` prove it: both create the same table and row without cleanup, which fails on a shared database whatever the timing (checked by pointing both at one database: 1 failed, in parallel and serial).
- **Inside a file**: `truncateAllTables(prisma)` in `beforeEach` (every table except `_prisma_migrations`).
- **Guards**: `DATABASE_URL_TEST` must match `[a-z0-9_]{1,40}_test` and differ from `DATABASE_URL`; the dev database is never touched. Unreachable Postgres fails with "Run `pnpm db:up`".
- **Unit tests have no database**: `unit-setup.ts` points `DATABASE_URL` at a closed port, so an accidental query fails at once.
- **Clock and randomness**: inject `Clock` and `Random` (`common/clock-and-random.module.ts`, global) instead of calling `new Date()` or `randomUUID()`. Tests pass `FixedClock` and `SequentialRandom` to `createTestApp`. Production request ids come from the app's `Random`; `createTestApp` gives the middleware its own, so pinned ids do not depend on how many requests a test sends. `src/testing/example.integration.spec.ts` is the pattern to copy.
- **CI: two jobs.** Unit tests run without a Postgres service, which enforces the split: a unit test that starts needing a database fails there. Integration tests run in parallel with it, with their own Postgres. One merged job would save one checkout and install (about a minute of runner time) but would let database dependencies creep back into unit tests unnoticed.

## Consequences
- Two integration runs against the same server at once: the second fails with "Another integration run is using ...". Deliberate: without the lock it would drop the first run's clones.
- A client connected to the template (psql, an IDE) makes cloning fail; the error says so. The template is dropped with `FORCE` at the start of each run.
- Runtime grows with the number of migrations (one `migrate deploy` per run on an empty database). Revisit with a schema-hash cache if it passes a few seconds.
- Watch mode (`vitest --config vitest.integration.config.mts` without `run`) builds the template once: restart it after adding a migration.
- The lock lives on one connection. If Postgres restarts mid-run, a second run could take it; acceptable for a local test database.
- `DATABASE_URL_TEST` is capped at 45 characters so clone names stay under Postgres's 63-byte identifier limit (longer names are silently truncated and would collide).
- Each file opens its own connection pool; with many workers, watch Postgres `max_connections` (100 by default).

## Learnings
- After a failed migration Prisma records it and refuses later `migrate deploy` runs, even once the migration is fixed. Recreating the throwaway template every run removes that trap.
- A parallel isolation test that only passes when the files overlap in time proves little. Same table and key, never cleaned up, fails on a shared database in every interleaving.
