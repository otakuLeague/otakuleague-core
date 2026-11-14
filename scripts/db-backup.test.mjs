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

// The DB backup job's shell steps (OTA-170), run from the workflow file against a fake `docker`
// (prints a dump or fails like pg_dump) and a fake `age` (rot13, so a plaintext leak is visible).
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(
  join(HERE, '../.github/workflows/db-backup.yml'),
  'utf8',
).split('\n');
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

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_LOG"
[ "$1" = run ] || exit 0
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

function assertNoSecretParts(output) {
  for (const part of [PASSWORD, HOST, PORT, 'AGE-SECRET-KEY']) {
    assert.ok(!output.includes(part), `output leaks ${part}`);
  }
}

test('check: valid secrets pass and mask the password, host and port, printing nothing else', () => {
  const { status, stdout, stderr } = runStep('Check secrets', SECRETS);
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.deepEqual(stdout.trim().split('\n'), [
    `::add-mask::${PASSWORD}`,
    `::add-mask::${HOST}`,
    `::add-mask::${PORT}`,
  ]);
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

test('check: a malformed secret fails without echoing it', () => {
  const cases = [
    { BACKUP_AGE_PUBLIC_KEY: PRIVATE_KEY }, // private key pasted into the public slot
    { BACKUP_AGE_PUBLIC_KEY: `${KEY}\n` },
    { BACKUP_AGE_PUBLIC_KEY: KEY.toUpperCase() },
    { BACKUP_DATABASE_URL: `https://postgres:${PASSWORD}@${HOST}:${PORT}/x` },
    { BACKUP_DATABASE_URL: `${URL}\n` },
    // No password, no port, no database.
    { BACKUP_DATABASE_URL: `postgresql://${HOST}:${PORT}/railway` },
    { BACKUP_DATABASE_URL: `postgresql://postgres:${PASSWORD}@${HOST}/x` },
    {
      BACKUP_DATABASE_URL: `postgresql://postgres:${PASSWORD}@${HOST}:${PORT}`,
    },
  ];
  for (const override of cases) {
    const { status, stdout, stderr } = runStep('Check secrets', {
      ...SECRETS,
      ...override,
    });
    assert.equal(status, 1, JSON.stringify(override));
    assert.match(
      stdout,
      /^::error::BACKUP_(AGE_PUBLIC_KEY|DATABASE_URL) is not /,
    );
    assert.ok(!(stdout + stderr).includes(Object.values(override)[0].trim()));
    assertNoSecretParts(stdout + stderr);
  }
});

test('dump: streams pg_dump into age and writes only the encrypted file', () => {
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

  // The URL travels by name only, inside the container's environment.
  const docker = read('docker.log');
  assert.match(
    docker,
    /^run .*-e BACKUP_DATABASE_URL -e PGSSLMODE=require postgres:18 /,
  );
  assert.match(docker, /--format=custom --no-owner --no-privileges/);
  assertNoSecretParts(docker);

  // No plaintext anywhere on disk; the log shows the size and nothing else.
  for (const file of readdirSync(temp, { recursive: true })) {
    const path = join(temp, file);
    if (statSync(path).isFile()) {
      assert.ok(
        !readFileSync(path, 'utf8').includes(DUMP),
        `plaintext in ${file}`,
      );
    }
  }
  assert.equal(stdout, `Encrypted dump: ${DUMP.length} bytes\n`);
  assertNoSecretParts(stdout + stderr);
  assert.match(read('summary'), /artifact `db-backup`/);
});

test('dump: fails when pg_dump fails, the dump is empty, or age fails', () => {
  for (const [env, message] of [
    [{ FAKE_PG_DUMP: 'fail' }, /pg_dump: error/],
    [{ FAKE_PG_DUMP: 'empty' }, /^::error::The dump is empty/],
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
