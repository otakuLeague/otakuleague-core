// Runs `pnpm clean` in scratch copies, never in this repo: the real .env is never at risk.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';
import { URL, fileURLToPath } from 'node:url';
import { BUILD_OUTPUT, clean } from './clean.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), 'ota89-clean-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

// Must survive: every env file, and sources next to the build output.
const KEPT = [
  '.env',
  '.env.example',
  'apps/web/.env.local',
  'apps/api/src/main.ts',
  'apps/api/prisma/schema.prisma',
  'packages/shared-types/src/index.ts',
];
const CACHES = [
  'node_modules/.vitest-cache/entry',
  'apps/web/node_modules/.vite/vitest/results.json',
];

function write(root, relative, content = 'x') {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A fake checkout: the real clean script and `clean` command, build output, env files, sources. */
function scratchCopy(name) {
  const root = path.join(tmp, name);
  const { scripts } = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  write(
    root,
    'package.json',
    JSON.stringify({ name, private: true, scripts: { clean: scripts.clean } }),
  );
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(
    path.join(repoRoot, 'scripts/clean.mjs'),
    path.join(root, 'scripts/clean.mjs'),
  );
  for (const relative of BUILD_OUTPUT) {
    // Folders get a file inside; tsconfig.tsbuildinfo and next-env.d.ts are files.
    write(root, path.extname(relative) ? relative : `${relative}/built.js`);
  }
  for (const relative of [...KEPT, ...CACHES]) {
    write(root, relative, `content of ${relative}`);
  }
  return root;
}

function assertCleaned(root) {
  for (const relative of [...BUILD_OUTPUT, ...CACHES]) {
    assert.equal(
      existsSync(path.join(root, relative)),
      false,
      `${relative} still exists`,
    );
  }
  for (const relative of KEPT) {
    assert.equal(
      readFileSync(path.join(root, relative), 'utf8'),
      `content of ${relative}`,
    );
  }
}

test('pnpm clean removes the build output and keeps .env, .env.example and sources', () => {
  const scratch = scratchCopy('pnpm');

  const run = spawnSync('pnpm', ['clean'], { cwd: scratch, encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assertCleaned(scratch);
});

test('the script also runs when reached through a symlinked path', () => {
  const scratch = scratchCopy('real');
  const link = path.join(tmp, 'link');
  symlinkSync(scratch, link);

  const run = spawnSync(
    process.execPath,
    [path.join(link, 'scripts/clean.mjs')],
    { encoding: 'utf8' },
  );

  assert.equal(run.status, 0, run.stderr);
  assertCleaned(scratch);
});

test('clean refuses an env file, the root itself or a path outside the root, and deletes nothing', () => {
  const scratch = path.join(tmp, 'refusals');
  write(scratch, '.env', 'kept');
  write(scratch, 'node_modules/kept.js', 'kept');
  for (const paths of [
    ['.env'],
    ['apps/web/.env.local'],
    ['apps/web/.ENV.local'],
    ['node_modules', '.env.example'],
    ['.'],
    ['../elsewhere'],
  ]) {
    assert.throws(() => clean(scratch, paths), /Refusing to delete/);
  }
  // All or nothing: node_modules, valid in one of the lists, was not deleted either.
  for (const relative of ['.env', 'node_modules/kept.js']) {
    assert.equal(readFileSync(path.join(scratch, relative), 'utf8'), 'kept');
  }
});
