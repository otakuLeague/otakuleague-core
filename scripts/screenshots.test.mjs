import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { answer, loadReplay } from './screenshots/fake-sources.mjs';
import { buildComment, COMMENT_MARKER } from './screenshots/comment.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const replay = loadReplay();
const config = JSON.parse(readFileSync(join(HERE, 'screenshots/routes.json'), 'utf8'));

test('replay: core anime by AniList id and by MAL id', () => {
  assert.equal(answer(replay, 'POST', '/', { variables: { idMal: 52991 } }).body.data.Media.id, 154587);
  assert.equal(answer(replay, 'POST', '/', { variables: { id: 154587 } }).status, 200);
});

test('replay: unknown anime is the recorded 404', () => {
  const result = answer(replay, 'POST', '/', { variables: { idMal: 1 } });
  assert.equal(result.status, 404);
  assert.equal(result.body.data.Media, null);
});

test('replay: walk answers known ids and leaves unknown ones out', () => {
  const { body } = answer(replay, 'POST', '/', { variables: { ids: [154587, 424242], perPage: 50 } });
  assert.deepEqual(body.data.Page.media.map((node) => node.id), [154587]);
  assert.equal(body.data.Page.pageInfo.hasNextPage, false);
  assert.deepEqual(answer(replay, 'POST', '/', { variables: { ids: [] } }).body.data.Page.media, []);
});

test('replay: Jikan by MAL id, else 404; junk bodies and routes are 404', () => {
  assert.equal(answer(replay, 'GET', '/v4/anime/52991').body.data.mal_id, 52991);
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
        { width: 1440, scheme: 'dark', file: 'home-1440-dark.png', error: null },
        { width: 390, scheme: 'light', file: null, error: 'Timeout @claude\nexceeded' },
      ],
    },
    { name: 'empty', path: '/e', shots: [] },
  ],
  warnings: ['seed 21: boom'],
};

test('comment: marker on line 1, one block per route, failures as text', () => {
  const lines = buildComment(manifest).split('\n');
  assert.equal(lines[0], COMMENT_MARKER);
  const text = lines.join('\n');
  assert.equal(lines.filter((line) => line.startsWith('### ')).length, 2);
  assert.match(text, /!\[1440px dark\]\(\{\{IMAGE_BASE\}\}\/home-1440-dark\.png\)/);
  assert.match(text, /- 390px light: not captured \(Timeout claude exceeded\)/);
  assert.match(text, /- seed 21: boom/);
  assert.ok(!text.includes('@'));
});

test('routes.json: at most 8 unique, well-formed routes and seeds', () => {
  assert.ok(config.routes.length >= 1 && config.routes.length <= 8);
  assert.equal(new Set(config.routes.map((r) => r.name)).size, config.routes.length);
  for (const route of config.routes) {
    assert.match(route.name, /^[a-z0-9-]+$/);
    assert.match(route.path, /^\/[a-z0-9\-/]*$/);
  }
  assert.ok(config.seedMalIds.every((id) => Number.isInteger(id) && id > 0));
});
