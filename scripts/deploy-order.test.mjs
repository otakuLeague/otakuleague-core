import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEPLOY_ORDER_MESSAGE, deployOrderWarning } from './deploy-order.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'deploy-order.mjs',
);

function runCli(input) {
  return spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });
}

test('web + API + shared-types warns', () => {
  const paths = [
    'apps/api/src/a.service.ts',
    'apps/web/app/page.tsx',
    'packages/shared-types/src/x.ts',
  ];
  assert.equal(deployOrderWarning(paths), DEPLOY_ORDER_MESSAGE);
});

test('web + API controller warns', () => {
  const paths = [
    'apps/api/src/anime/anime.controller.ts',
    'apps/web/app/page.tsx',
  ];
  assert.equal(deployOrderWarning(paths), DEPLOY_ORDER_MESSAGE);
});

test('web + API service only does not warn', () => {
  assert.equal(
    deployOrderWarning([
      'apps/api/src/anime/anime.service.ts',
      'apps/web/app/page.tsx',
    ]),
    null,
  );
});

test('web + shared-types without API does not warn', () => {
  assert.equal(
    deployOrderWarning([
      'apps/web/app/page.tsx',
      'packages/shared-types/src/x.ts',
    ]),
    null,
  );
});

test('API controller without web does not warn', () => {
  assert.equal(
    deployOrderWarning(['apps/api/src/anime/anime.controller.ts']),
    null,
  );
});

test('controller spec files are not controllers', () => {
  const paths = [
    'apps/api/src/anime/anime.controller.spec.ts',
    'apps/web/app/page.tsx',
  ];
  assert.equal(deployOrderWarning(paths), null);
});

test('lookalike paths do not count', () => {
  const paths = [
    'docs/apps/web/x',
    'apps/api-old/x',
    'packages/shared-types/src/x.ts',
  ];
  assert.equal(deployOrderWarning(paths), null);
});

test('empty list does not warn', () => {
  assert.equal(deployOrderWarning([]), null);
});

test('CLI with empty input says the guard did not run, exit 0', () => {
  const result = runCli('\n');
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout.trim(),
    '::warning title=Deploy order::no changed files listed, the guard did not run',
  );
});

test('CLI prints the annotation for a risky change, exit 0', () => {
  const result = runCli(
    'apps/api/src/anime/anime.controller.ts\n  apps/web/app/page.tsx  \n\n',
  );
  assert.equal(result.status, 0);
  assert.ok(
    result.stdout.startsWith(
      '::warning title=Deploy order::web and API deploy separately',
    ),
  );
});

test('CLI prints nothing for a safe change, exit 0', () => {
  const result = runCli('apps/web/app/page.tsx\n');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});
