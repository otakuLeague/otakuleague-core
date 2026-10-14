import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import {
  clonePrefix,
  connectMaintenance,
  databaseName,
  testDatabaseUrl,
} from './test-database';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const API_DIR = resolve(__dirname, '../..');

/**
 * Runs once before the integration suite (ADR 0005): recreates and migrates the template
 * database and drops clones left by a crashed run. Throwing here aborts the suite.
 */
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const templateUrl = testDatabaseUrl();
  const template = databaseName(templateUrl);
  const maintenance = connectMaintenance(templateUrl);

  try {
    // Held until teardown, released by Postgres if this process dies. Without it, a second
    // run would drop this run's clones or migrate the template while it is being cloned.
    const [lock] = await maintenance.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(hashtext(${template})) AS acquired`;
    if (!lock.acquired) {
      throw new Error(
        `Another integration run is using ${template}. Wait for it to finish.`,
      );
    }

    // Rebuilt every run: no rows, failed migration or half-applied state survives a run.
    await maintenance.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${template}" WITH (FORCE)`,
    );
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${template}"`);

    // Clones left by a crashed run (this run's lock proves no live run owns them).
    const leftovers = await maintenance.$queryRaw<{ name: string }[]>`
      SELECT quote_ident(datname) AS name FROM pg_database
      WHERE starts_with(datname, ${clonePrefix(templateUrl)})`;
    for (const { name } of leftovers) {
      await maintenance.$executeRawUnsafe(`DROP DATABASE ${name} WITH (FORCE)`);
    }
  } catch (error) {
    await maintenance.$disconnect();
    throw unreachableOr(error, templateUrl);
  }

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: templateUrl.href },
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (error) {
    await maintenance.$disconnect();
    const output =
      error instanceof Error && 'stderr' in error && 'stdout' in error
        ? `${String(error.stdout)}${String(error.stderr)}`
        : String(error);
    throw new Error(
      `Migrations failed on ${template}; integration tests did not run.\n${output}`,
    );
  }

  project.provide('testDatabaseUrl', templateUrl.href);

  return async () => {
    await maintenance.$disconnect();
  };
}

function unreachableOr(error: unknown, templateUrl: URL): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /Can't reach database server|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/.test(message)
  ) {
    return new Error(
      `PostgreSQL is not reachable at ${templateUrl.host}. Run \`pnpm db:up\` at the repo root.`,
    );
  }
  return error;
}
