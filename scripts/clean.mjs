// `pnpm clean`: deletes build output only, from an explicit list. Use it instead of
// `git clean -x` / `-X`, which also delete the gitignored root .env (OTA-89).
// Run from the repo root: it overrides pnpm's built-in `clean`, which a package folder still gets.
import { realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

/**
 * Relative to the repo root. Literal paths, no globs: a new package adds its own lines.
 * Vitest's caches live inside node_modules (`node_modules/.vitest-cache`, `apps/*\/node_modules/.vite`).
 */
export const BUILD_OUTPUT = [
  'node_modules',
  'apps/api/node_modules',
  'apps/web/node_modules',
  'packages/shared-types/node_modules',
  'apps/api/dist',
  'packages/shared-types/dist',
  'apps/web/.next',
  'apps/web/tsconfig.tsbuildinfo',
  'apps/web/next-env.d.ts',
  'apps/api/src/generated',
];

/** Deletes `paths` under root, all or nothing: every path is checked before any is deleted. */
export function clean(root, paths = BUILD_OUTPUT) {
  for (const relative of paths) {
    const inside = path.relative(root, path.resolve(root, relative));
    if (
      inside === '' ||
      inside.startsWith('..') ||
      path.isAbsolute(inside) ||
      inside
        .split(path.sep)
        .some((segment) => segment.toLowerCase().startsWith('.env'))
    ) {
      throw new Error(`Refusing to delete ${relative}: not build output.`);
    }
  }
  for (const relative of paths) {
    rmSync(path.resolve(root, relative), { recursive: true, force: true });
  }
  return paths;
}

// realpath: import.meta.url has symlinks resolved, argv[1] does not. Without it a run through a
// symlinked path skipped this block and exited 0 having deleted nothing.
if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const relative of clean(root)) {
    process.stdout.write(`deleted if present: ${relative}\n`);
  }
  process.stdout.write(
    'Run `pnpm install` to restore dependencies. .env was not touched.\n',
  );
}
