import { PrismaPg } from '@prisma/adapter-pg';
import { REPO_ROOT_ENV_FILE } from '../config/environment';
import { PrismaClient } from '../generated/prisma/client';

// Integration tests only (ADR 0005). The database named by DATABASE_URL_TEST is the
// migrated template; each test file runs against its own clone of it.

/** DATABASE_URL_TEST from the environment or the repo-root .env, refused unless clearly a test database. */
export function testDatabaseUrl(): URL {
  try {
    process.loadEnvFile(REPO_ROOT_ENV_FILE);
  } catch (error) {
    // No .env (CI): DATABASE_URL_TEST must come from the real environment.
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    )) {
      throw error;
    }
  }
  const value = process.env.DATABASE_URL_TEST;
  if (!value || !URL.canParse(value)) {
    throw new Error(
      'DATABASE_URL_TEST is not set or not a URL. Run `cp .env.example .env` at the repo root, then `pnpm db:up`.',
    );
  }
  const url = new URL(value);
  // The suite drops and clones databases: refuse anything that is not a *_test database,
  // and the dev database even if someone renamed it. 45 characters at most, so
  // `<name>_file_<worker>` stays under Postgres's 63-byte limit instead of being cut short.
  if (!/^[a-z0-9_]{1,40}_test$/.test(databaseName(url))) {
    throw new Error(
      'DATABASE_URL_TEST must name a database matching [a-z0-9_]{1,40}_test.',
    );
  }
  if (process.env.DATABASE_URL && sameDatabase(url, process.env.DATABASE_URL)) {
    throw new Error('DATABASE_URL_TEST must differ from DATABASE_URL.');
  }
  return url;
}

export function databaseName(url: URL): string {
  return url.pathname.slice(1);
}

export function withDatabase(url: URL, name: string): URL {
  const copy = new URL(url);
  copy.pathname = `/${name}`;
  return copy;
}

/** Prefix of every per-file clone; anything with it is disposable. */
export function clonePrefix(templateUrl: URL): string {
  return `${databaseName(templateUrl)}_file_`;
}

// Compares host text as written: 127.0.0.1 and localhost count as different servers.
function sameDatabase(url: URL, other: string): boolean {
  if (!URL.canParse(other)) return false;
  const parsed = new URL(other);
  return parsed.host === url.host && parsed.pathname === url.pathname;
}

/**
 * One connection to the server's `postgres` maintenance database, for CREATE/DROP DATABASE.
 * A single, never-idle connection so a session advisory lock taken on it lasts the whole run.
 */
export function connectMaintenance(templateUrl: URL): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: withDatabase(templateUrl, 'postgres').href,
      max: 1,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 5_000,
    }),
  });
}

/** A client on this file's own database (DATABASE_URL, set by integration-setup.ts). */
export function connectTestDatabase(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

/** Empties every table except Prisma's migration history: call it in beforeEach. */
export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT quote_ident(tablename) AS name FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = tables.map((table) => `public.${table.name}`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}
