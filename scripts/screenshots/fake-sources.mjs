// Replay server for the PR screenshots (ADR 0013): answers the AniList and Jikan requests the API
// makes from the recorded fixtures, so the real import, merge and slug code runs with no live call.
// Usage: node scripts/screenshots/fake-sources.mjs   (listens on 127.0.0.1:4010)
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../apps/api/src/anime/sources/fixtures');
const PORT = 4010;

const isRecord = (value) => typeof value === 'object' && value !== null;

/** The recorded answers, indexed the way the API asks. */
export function loadReplay(fixtures = FIXTURES) {
  const names = readdirSync(fixtures);
  const read = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
  const coreById = new Map();
  const coreByMalId = new Map();
  for (const name of names.filter((n) => /^anilist-(?!walk-|not-found)/.test(n))) {
    const core = read(name);
    coreById.set(core.data.Media.id, core);
    coreByMalId.set(core.data.Media.idMal, core);
  }
  const walkNodes = new Map();
  for (const name of names.filter((n) => n.startsWith('anilist-walk-'))) {
    for (const { response } of read(name)) {
      for (const node of response.data.Page.media) walkNodes.set(node.id, node);
    }
  }
  const jikanByMalId = new Map();
  for (const name of names.filter((n) => n.startsWith('jikan-'))) {
    const anime = read(name);
    jikanByMalId.set(anime.data.mal_id, anime);
  }
  return { coreById, coreByMalId, walkNodes, jikanByMalId, notFound: read('anilist-not-found.json') };
}

/** Answer for one request: { status, body }. Pure, so the test needs no socket. */
export function answer(replay, method, url, requestBody) {
  const jikan = /^\/v4\/anime\/(\d+)$/.exec(url);
  if (method === 'GET' && jikan) {
    const found = replay.jikanByMalId.get(Number(jikan[1]));
    return found ? { status: 200, body: found } : { status: 404, body: { status: 404, type: 'BadResponseException' } };
  }
  if (method !== 'POST' || url !== '/') return { status: 404, body: { error: 'unknown route' } };
  const variables = isRecord(requestBody) && isRecord(requestBody.variables) ? requestBody.variables : {};
  if (Array.isArray(variables.ids)) {
    const media = variables.ids.map((id) => replay.walkNodes.get(id)).filter((node) => node !== undefined);
    return { status: 200, body: { data: { Page: { pageInfo: { hasNextPage: false }, media } } } };
  }
  const found = variables.id !== undefined ? replay.coreById.get(variables.id) : replay.coreByMalId.get(variables.idMal);
  return found ? { status: 200, body: found } : { status: 404, body: replay.notFound };
}

export function startReplayServer(port = PORT) {
  const replay = loadReplay();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        parsed = null;
      }
      const { status, body } = answer(replay, req.method ?? 'GET', req.url ?? '/', parsed);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await startReplayServer();
