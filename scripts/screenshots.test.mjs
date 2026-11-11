import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { answer, loadReplay } from './screenshots/fake-sources.mjs';
import { buildSummary } from './screenshots/summary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const replay = loadReplay();
const config = JSON.parse(
  readFileSync(join(HERE, 'screenshots/routes.json'), 'utf8'),
);

test('replay: core anime by AniList id and by MAL id', () => {
  assert.equal(
    answer(replay, 'POST', '/', { variables: { idMal: 52991 } }).body.data.Media
      .id,
    154587,
  );
  assert.equal(
    answer(replay, 'POST', '/', { variables: { id: 154587 } }).status,
    200,
  );
});

test('replay: unknown anime is the recorded 404', () => {
  const result = answer(replay, 'POST', '/', { variables: { idMal: 1 } });
  assert.equal(result.status, 404);
  assert.equal(result.body.data.Media, null);
});

test('replay: walk answers known ids and leaves unknown ones out', () => {
  const { body } = answer(replay, 'POST', '/', {
    variables: { ids: [154587, 424242], perPage: 50 },
  });
  assert.deepEqual(
    body.data.Page.media.map((node) => node.id),
    [154587],
  );
  assert.equal(body.data.Page.pageInfo.hasNextPage, false);
  assert.deepEqual(
    answer(replay, 'POST', '/', { variables: { ids: [] } }).body.data.Page
      .media,
    [],
  );
});

test('replay: Jikan by MAL id, else 404; junk bodies and routes are 404', () => {
  assert.equal(
    answer(replay, 'GET', '/v4/anime/52991').body.data.mal_id,
    52991,
  );
  assert.equal(answer(replay, 'GET', '/v4/anime/2963').status, 404);
  assert.equal(answer(replay, 'POST', '/', null).status, 404);
  assert.equal(answer(replay, 'GET', '/elsewhere').status, 404);
});

const manifest = {
  routes: [
    {
      name: 'home',
      path: '/',
      shots: [
        {
          width: 1440,
          scheme: 'dark',
          file: 'home-1440-dark.png',
          error: null,
        },
        {
          width: 390,
          scheme: 'light',
          file: null,
          error: 'Timeout @claude\nexceeded',
        },
      ],
    },
    { name: 'empty', path: '/e', shots: [] },
  ],
  warnings: ['seed 21: boom'],
};

test('summary: counts, one line per missing shot, warnings, no mention', () => {
  const text = buildSummary(manifest);
  assert.match(text, /^## Screenshots\n\n1 of 2 captured/);
  assert.match(
    text,
    /- home \(`\/`\):\n {2}- 390px light: not captured \(Timeout claude exceeded\)/,
  );
  assert.ok(!text.includes('empty'));
  assert.match(text, /- seed 21: boom/);
  assert.ok(!text.includes('@'));
  assert.match(
    buildSummary({ routes: [], warnings: ['capture: no routes.json'] }),
    /0 of 0 captured/,
  );
});

test('routes.json: at most 8 unique, well-formed routes and seeds', () => {
  assert.ok(config.routes.length >= 1 && config.routes.length <= 8);
  assert.equal(
    new Set(config.routes.map((r) => r.name)).size,
    config.routes.length,
  );
  for (const route of config.routes) {
    assert.match(route.name, /^[a-z0-9-]{1,60}$/); // what publish accepts in a file name
    assert.match(route.path, /^\/[a-z0-9\-/]*$/);
  }
  assert.ok(config.seedMalIds.every((id) => Number.isInteger(id) && id > 0));
});

// The publish job's shell steps, run as GitHub runs them (bash -eo pipefail) against a hostile
// artifact and a fake `gh`. The workflow file is the source: no copy of the scripts here.
const WORKFLOW = readFileSync(
  join(HERE, '../.github/workflows/screenshots.yml'),
  'utf8',
).split('\n');
const SHA = 'a'.repeat(40);
const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
const scratch = mkdtempSync(join(tmpdir(), 'screenshots-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

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

/** Runs a step in a fresh RUNNER_TEMP; `gh` answers from a bash `case` on its arguments. */
function runStep(
  name,
  { prepare = () => undefined, env = {}, gh = 'exit 1' } = {},
) {
  const temp = mkdtempSync(join(scratch, 'run-'));
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env bash\necho "$*" >> "$GH_LOG"\ncase "$*" in\n${gh}\nesac\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  prepare(temp);
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', '-c', stepScript(name)],
    {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        GITHUB_OUTPUT: join(temp, 'output'),
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '99',
        GH_LOG: join(temp, 'gh.log'),
        REPO: 'o/r',
        PR: '7',
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

test('publish: copies only regular PNGs named like a shot, prints no artifact name', () => {
  const evil = [
    '##[set-output name=sha;]x#e;id.png',
    'evil\nhome-390-dark.png',
    'home-390-dark.png\n',
  ];
  const { status, stdout, stderr, temp, read } = runStep('Select the images', {
    prepare: (temp) => {
      const shots = join(temp, 'shots');
      mkdirSync(shots);
      for (const name of [
        'home-1440-dark.png',
        'anime-overview-390-light.png',
        ...evil,
        'Home-1440-dark.png',
      ]) {
        writeFileSync(join(shots, name), PNG);
      }
      writeFileSync(join(shots, `${'a'.repeat(61)}-1440-dark.png`), PNG);
      writeFileSync(join(shots, 'home-1024-dark.png'), PNG);
      writeFileSync(join(shots, 'text-1440-dark.png'), 'not a png');
      writeFileSync(join(shots, 'empty-1440-dark.png'), '');
      writeFileSync(
        join(shots, 'big-1440-dark.png'),
        Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
      );
      mkdirSync(join(shots, 'dir-1440-dark.png'));
      writeFileSync(join(temp, 'outside.png'), PNG);
      symlinkSync(join(temp, 'outside.png'), join(shots, 'link-1440-dark.png'));
    },
  });
  assert.equal(status, 0, stderr);
  assert.deepEqual(readdirSync(join(temp, 'site')).sort(), [
    'anime-overview-390-light.png',
    'home-1440-dark.png',
  ]);
  assert.equal(read('output'), 'images=2\n');
  assert.doesNotMatch(stdout + stderr, /set-output|evil|link|big|text/);
});

test('publish: at most 32 images, and none when there is no artifact', () => {
  const many = runStep('Select the images', {
    prepare: (temp) => {
      mkdirSync(join(temp, 'shots'));
      for (let i = 0; i < 40; i += 1)
        writeFileSync(join(temp, 'shots', `r${i}-390-dark.png`), PNG);
    },
  });
  assert.equal(many.read('output'), 'images=32\n');
  assert.equal(readdirSync(join(many.temp, 'site')).length, 32);
  assert.equal(runStep('Select the images').read('output'), 'images=0\n');
});

test('publish: comment from file names, grouped per route, linked to the run', () => {
  const site = (names) => (temp) => {
    mkdirSync(join(temp, 'site'));
    for (const name of names) writeFileSync(join(temp, 'site', name), PNG);
  };
  const names = [
    'home-1440-dark.png',
    'home-390-light.png',
    'anime-overview-1440-dark.png',
  ];
  const { status, read } = runStep('Write the comment', {
    prepare: site(names),
    env: { SHA },
  });
  assert.equal(status, 0);
  const comment = read('comment.md');
  assert.equal(comment.split('\n')[0], '<!-- pr-screenshots -->');
  assert.deepEqual(
    [...comment.matchAll(/<summary><code>([^<]+)</g)].map((m) => m[1]),
    ['anime-overview', 'home'],
  );
  assert.equal(
    comment.match(/<details>/g).length,
    comment.match(/<\/details>/g).length,
  );
  assert.ok(
    comment.includes(
      `<img width="360" alt="home 390 light" src="https://github.com/o/r/raw/${SHA}/home-390-light.png">`,
    ),
  );
  assert.ok(comment.includes('(https://github.com/o/r/actions/runs/99)'));

  const none = runStep('Write the comment', { prepare: site([]) });
  assert.equal(none.status, 0);
  assert.match(
    none.read('comment.md'),
    /No screenshots were captured .*actions\/runs\/99/,
  );

  for (const bad of ['', 'x#e;id', `${SHA}\n`]) {
    assert.notEqual(
      runStep('Write the comment', { prepare: site(names), env: { SHA: bad } })
        .status,
      0,
    );
  }
});

test('publish: one sticky comment, and no new one when the lookup fails', () => {
  const upsert = (gh) =>
    runStep('Upsert the comment', {
      gh,
      prepare: (temp) => writeFileSync(join(temp, 'comment.md'), 'x'),
    });
  assert.match(
    upsert('*/issues/7/comments\\?*) printf "77\\n88\\n" ;;\n*) ;;').read(
      'gh.log',
    ),
    /-X PATCH repos\/o\/r\/issues\/comments\/77 /,
  );
  assert.match(
    upsert('*/issues/7/comments\\?*) ;;\n*) ;;').read('gh.log'),
    /-X POST repos\/o\/r\/issues\/7\/comments /,
  );
  const failed = upsert('*/issues/7/comments\\?*) exit 1 ;;\n*) ;;');
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.read('gh.log'), /-X (POST|PATCH)/);
});

test('publish: prunes only branches whose PR answers closed', () => {
  const { status, read } = runStep('Delete the branches of closed PRs', {
    gh: [
      '*/branches\\?*) printf "%s\\n" screenshots/pr-1 screenshots/pr-2 screenshots/pr-3 screenshots/pr-4a screenshots/pr-5 ;;',
      '*"-X DELETE"*) ;;',
      '*/pulls/1\\ *) echo closed ;;',
      '*/pulls/2\\ *) echo open ;;',
      '*/pulls/4a\\ *) echo closed ;;',
      '*/pulls/5\\ *) ;;',
      '*) exit 1 ;;',
    ].join('\n'),
  });
  assert.equal(status, 0);
  assert.deepEqual(
    read('gh.log')
      .split('\n')
      .filter((line) => line.includes('DELETE')),
    ['api -X DELETE repos/o/r/git/refs/heads/screenshots/pr-1'],
  );
});
