import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The DB backup job (OTA-170): its shell steps, run from the workflow file against a fake
// `docker` (prints a dump or fails like pg_dump) and a fake `age` (rot13, so a plaintext leak
// is visible), plus checks on the workflow text itself.
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_TEXT = readFileSync(
  join(HERE, '../.github/workflows/db-backup.yml'),
  'utf8',
);
const WORKFLOW = WORKFLOW_TEXT.split('\n');
const SCHEMA = readFileSync(
  join(HERE, '../apps/api/prisma/schema.prisma'),
  'utf8',
);
const PASSWORD = 'Pa55wordFromRailway';
const HOST = 'yamabiko.proxy.rlwy.net';
const PORT = '41234';
const URL = `postgresql://postgres:${PASSWORD}@${HOST}:${PORT}/railway`;
const KEY = `age1${'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.repeat(2).slice(0, 58)}`;
const PRIVATE_KEY = `AGE-SECRET-KEY-1${'Q'.repeat(58)}`;
const DUMP = 'PGDMP fake custom-format archive with anime rows';
const SECRETS = { BACKUP_DATABASE_URL: URL, BACKUP_AGE_PUBLIC_KEY: KEY };
const scratch = mkdtempSync(join(tmpdir(), 'db-backup-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Records its arguments and the libpq variables it was given (the real client forwards `-e NAME`).
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_LOG"
[ "$1" = run ] || exit 0
printf '%s\\n' "$PGHOST" "$PGPORT" "$PGUSER" "$PGPASSWORD" "$PGDATABASE" "$PGSSLMODE" > "$PG_ENV_LOG"
case "$FAKE_PG_DUMP" in
  ok) printf '%s' "$DUMP" ;;
  empty) ;;
  fail) printf 'PGDMP partial'; echo 'pg_dump: error: connection to server failed' >&2; exit 1 ;;
esac
`;
const FAKE_AGE = `#!/usr/bin/env bash
out=/dev/stdout
while [ $# -gt 0 ]; do
  case "$1" in
    --recipient) printf '%s\\n' "$2" >> "$AGE_LOG"; shift 2 ;;
    --output) out=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ "$FAKE_AGE" != fail ] || { echo 'age: error: no identity matched' >&2; exit 1; }
tr 'A-Za-z' 'N-ZA-Mn-za-m' > "$out"
`;
const rot13 = (text) =>
  text.replace(/[a-z]/gi, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });

function stepScript(name) {
  const start = WORKFLOW.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(start > 0, `step ${name}`);
  const run = WORKFLOW.findIndex(
    (line, index) => index > start && line.trim() === 'run: |',
  );
  const indent = WORKFLOW[run + 1].search(/\S/);
  const end = WORKFLOW.findIndex(
    (line, index) =>
      index > run && line.trim() !== '' && line.search(/\S/) < indent,
  );
  return WORKFLOW.slice(run + 1, end)
    .map((line) => line.slice(indent))
    .join('\n');
}

/** Runs a step in a fresh RUNNER_TEMP (also the working directory) with the fakes first on PATH. */
function runStep(name, env) {
  const temp = mkdtempSync(join(scratch, 'run-'));
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  for (const [tool, script] of [
    ['docker', FAKE_DOCKER],
    ['age', FAKE_AGE],
  ]) {
    writeFileSync(join(bin, tool), script);
    chmodSync(join(bin, tool), 0o755);
  }
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-c', stepScript(name)],
    {
      cwd: temp,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        GITHUB_STEP_SUMMARY: join(temp, 'summary'),
        DOCKER_LOG: join(temp, 'docker.log'),
        PG_ENV_LOG: join(temp, 'pg-env.log'),
        AGE_LOG: join(temp, 'age.log'),
        DUMP,
        ...env,
      },
    },
  );
  const read = (file) => {
    try {
      return readFileSync(join(temp, file), 'utf8');
    } catch {
      return '';
    }
  };
  return { ...result, temp, read };
}

/** Every output line that names a secret part must be the mask command for it. */
function assertNoSecretParts(output) {
  for (const line of output.split('\n')) {
    if (line.startsWith('::add-mask::')) continue;
    for (const part of [PASSWORD, HOST, PORT, 'AGE-SECRET-KEY']) {
      assert.ok(!line.includes(part), `output leaks ${part}: ${line}`);
    }
  }
}

test('workflow: only schedule and manual triggers, no token, secrets only in the two step envs', () => {
  const on = WORKFLOW.indexOf('on:');
  const end = WORKFLOW.findIndex(
    (line, index) => index > on && /^\S/.test(line),
  );
  assert.deepEqual(
    WORKFLOW.slice(on + 1, end).filter((line) => /^ {2}\S/.test(line)),
    ['  schedule:', '  workflow_dispatch:'],
  );
  assert.deepEqual(
    WORKFLOW.filter((line) => line.includes('permissions:')),
    ['permissions: {}'],
  );
  const secretLines = WORKFLOW.flatMap((line, index) =>
    line.includes('secrets.') ? [index] : [],
  );
  assert.equal(secretLines.length, 4);
  for (const index of secretLines) {
    assert.match(
      WORKFLOW[index],
      /^ {10}(BACKUP_DATABASE_URL|BACKUP_AGE_PUBLIC_KEY): \$\{\{ secrets\.\1 \}\}$/,
    );
    const env = WORKFLOW.findLastIndex(
      (line, above) => above < index && line.trim() === 'env:',
    );
    const step = WORKFLOW.findLastIndex(
      (line, above) => above < index && line.trimStart().startsWith('- name:'),
    );
    assert.equal(WORKFLOW[env], '        env:');
    assert.equal(step, env - 1, 'env belongs to the step right above it');
    assert.match(WORKFLOW[step], /- name: (Check secrets|Dump and encrypt)$/);
  }
  assert.match(WORKFLOW_TEXT, /^ {10}retention-days: 60$/m);
  assert.match(WORKFLOW_TEXT, /^ {4}runs-on: ubuntu-24\.04$/m);
  const uses = WORKFLOW.filter((line) => line.includes('uses:'));
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.match(line, /uses: [\w-]+\/[\w-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
  }
});

test('workflow: the excluded cache tables exist in the schema', () => {
  const excluded = [
    ...WORKFLOW_TEXT.matchAll(/--exclude-table-data=public\.(\w+)/g),
  ].map((match) => match[1]);
  assert.deepEqual(excluded.toSorted(), [
    'anime_list_page',
    'anime_relation_node',
    'anime_source_snapshot',
  ]);
  for (const table of excluded) {
    assert.ok(SCHEMA.includes(`@@map("${table}")`), `${table} in schema`);
  }
});

test('check: valid secrets pass silently', () => {
  const { status, stdout, stderr } = runStep('Check secrets', SECRETS);
  assert.equal(status, 0, stderr);
  assert.equal(stdout + stderr, '');
});

test('check: a missing or empty secret fails by name', () => {
  for (const secret of Object.keys(SECRETS)) {
    for (const value of [undefined, '']) {
      const env = { ...SECRETS, [secret]: value };
      if (value === undefined) delete env[secret];
      const { status, stdout } = runStep('Check secrets', env);
      assert.equal(status, 1, `${secret}=${value}`);
      assert.match(stdout, new RegExp(`^::error::Secret ${secret} is missing`));
    }
  }
});

test('check: a malformed public key fails without echoing it', () => {
  for (const key of [PRIVATE_KEY, `${KEY}\n`, KEY.toUpperCase()]) {
    const { status, stdout, stderr } = runStep('Check secrets', {
      ...SECRETS,
      BACKUP_AGE_PUBLIC_KEY: key,
    });
    assert.equal(status, 1, key);
    assert.match(stdout, /^::error::BACKUP_AGE_PUBLIC_KEY is not /);
    assert.ok(!(stdout + stderr).includes(key.trim()));
    assertNoSecretParts(stdout + stderr);
  }
});

test('dump: a malformed URL fails before any connection, without echoing it', () => {
  const cases = [
    [`${URL}?sslmode=disable`, /has a query string/],
    [URL.replace(PASSWORD, 'Pa%40ss'), /percent-encoded/],
    [`https://postgres:${PASSWORD}@${HOST}:${PORT}/x`, /is not a postgresql/],
    [`${URL}\n`, /is not a postgresql/],
    // No password, no port, no database, a quote in the password.
    [`postgresql://${HOST}:${PORT}/railway`, /is not a postgresql/],
    [`postgresql://postgres:${PASSWORD}@${HOST}/x`, /is not a postgresql/],
    [
      `postgresql://postgres:${PASSWORD}@${HOST}:${PORT}`,
      /is not a postgresql/,
    ],
    [URL.replace(PASSWORD, `${PASSWORD}'`), /is not a postgresql/],
  ];
  for (const [url, message] of cases) {
    const { status, stdout, stderr, read } = runStep('Dump and encrypt', {
      ...SECRETS,
      BACKUP_DATABASE_URL: url,
      FAKE_PG_DUMP: 'ok',
    });
    assert.equal(status, 1, url);
    assert.match(stdout, /^::error::BACKUP_DATABASE_URL /);
    assert.match(stdout, message);
    assert.ok(!(stdout + stderr).includes(url.trim()));
    assertNoSecretParts(stdout + stderr);
    assert.equal(read('docker.log'), '', 'docker never ran');
  }
});

test('dump: streams pg_dump into age with the URL split into libpq variables', () => {
  const { status, stdout, stderr, temp, read } = runStep('Dump and encrypt', {
    ...SECRETS,
    FAKE_PG_DUMP: 'ok',
  });
  assert.equal(status, 0, stderr);
  const files = readdirSync(join(temp, 'db-backup'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^otakuleague-\d{4}-\d{2}-\d{2}T\d{4}Z\.dump\.age$/);
  assert.equal(rot13(read(`db-backup/${files[0]}`)), DUMP);
  assert.deepEqual(read('age.log').trim().split('\n'), [KEY, KEY]);

  // Names only on the command line, no Docker log file, values through the environment.
  const docker = read('docker.log');
  assert.match(
    docker,
    /^run --rm --pull=never --log-driver none -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE postgres:18 pg_dump --format=custom --no-owner --no-privileges /,
  );
  assert.ok(!docker.includes('--dbname'));
  assertNoSecretParts(docker);
  assert.deepEqual(read('pg-env.log').trim().split('\n'), [
    HOST,
    PORT,
    'postgres',
    PASSWORD,
    'railway',
    'require',
  ]);

  // No plaintext in any file; the log shows the masks, then the size, and nothing else.
  for (const file of readdirSync(temp, { recursive: true })) {
    const path = join(temp, file);
    if (statSync(path).isFile()) {
      assert.ok(
        !readFileSync(path, 'utf8').includes(DUMP),
        `plaintext in ${file}`,
      );
    }
  }
  assert.deepEqual(stdout.trim().split('\n'), [
    `::add-mask::${PASSWORD}`,
    `::add-mask::${HOST}`,
    `::add-mask::${PORT}`,
    `Encrypted dump: ${DUMP.length} bytes`,
  ]);
  assertNoSecretParts(stdout + stderr);
  assert.match(read('summary'), /artifact `db-backup`/);
});

test('dump: fails when pg_dump fails, the dump is empty, or age fails', () => {
  for (const [env, message] of [
    [{ FAKE_PG_DUMP: 'fail' }, /pg_dump: error/],
    [{ FAKE_PG_DUMP: 'empty' }, /::error::The dump is empty/],
    [{ FAKE_PG_DUMP: 'ok', FAKE_AGE: 'fail' }, /age: error/],
  ]) {
    const { status, stdout, stderr } = runStep('Dump and encrypt', {
      ...SECRETS,
      ...env,
    });
    assert.notEqual(status, 0, JSON.stringify(env));
    assert.match(stdout + stderr, message);
    assert.ok(!stdout.includes('Encrypted dump:'), JSON.stringify(env));
  }
});
