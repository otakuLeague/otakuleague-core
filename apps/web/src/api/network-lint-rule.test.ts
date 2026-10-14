// @vitest-environment node
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Runs the real apps/web ESLint config on in-memory code. Type-aware linting only accepts paths
// that exist in the TypeScript project, so "outside the client" borrows this test file's own path.
const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname });
const OUTSIDE_CLIENT = 'src/api/network-lint-rule.test.ts';
// The createApiClient ban applies outside src/api; every Next app has app/page.tsx.
const OUTSIDE_API_FOLDER = 'app/page.tsx';
const CLIENT = 'src/api/client.ts';

const RAW_FETCH_CALLS = [
  "await fetch('http://127.0.0.1:3001/health');",
  "await globalThis.fetch('http://127.0.0.1:3001/health');",
  "await window.fetch('http://127.0.0.1:3001/health');",
  "await self.fetch('http://127.0.0.1:3001/health');",
  "await global.fetch('http://127.0.0.1:3001/health');",
  'const { fetch: rawFetch } = globalThis;\nawait rawFetch("/health");',
  "new XMLHttpRequest().open('GET', '/health');",
  "new EventSource('/events').close();",
]
  .map(
    (statement) =>
      `export async function load(): Promise<void> {\n  ${statement}\n}\n`,
  )
  .concat(
    "import { request } from 'node:http';\nexport const send = request;\n",
    "import { fetch } from 'undici';\nexport const send = fetch;\n",
  );

const NETWORK_RULE = /^no-restricted-(globals|properties|imports)$/;
const BUILD_OWN_CLIENT =
  "import { createApiClient } from '../src/api/client';\nexport const build = createApiClient;\n";

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [lintResult] = await eslint.lintText(code, { filePath });
  const messages = lintResult?.messages ?? [];
  // A parsing error has no rule id; fail loudly instead of passing for the wrong reason.
  expect(messages.filter((message) => message.fatal === true)).toEqual([]);
  return messages.map((message) => message.ruleId ?? 'unknown');
}

describe('network lint rule', () => {
  // The first lint builds the TypeScript program (over 5 s on a CI runner); pay it once here so
  // each case's default timeout covers one lint, not the cold start.
  beforeAll(async () => {
    await eslint.lintText('export {};\n', { filePath: OUTSIDE_CLIENT });
  }, 60_000);

  it.each(RAW_FETCH_CALLS)(
    'fires on a raw fetch outside the client:\n%s',
    async (code) => {
      const ruleIds = await ruleIdsFor(code, OUTSIDE_CLIENT);

      expect(ruleIds).toEqual(
        expect.arrayContaining([expect.stringMatching(NETWORK_RULE)]),
      );
    },
  );

  it.each(RAW_FETCH_CALLS)(
    'does not fire inside src/api/client.ts:\n%s',
    async (code) => {
      const ruleIds = await ruleIdsFor(code, CLIENT);

      expect(
        ruleIds.filter((ruleId) => ruleId.startsWith('no-restricted-')),
      ).toEqual([]);
    },
  );

  it.each(['../src/api/client', '@/src/api/client'])(
    'forbids importing createApiClient from %j outside src/api',
    async (specifier) => {
      const code = BUILD_OWN_CLIENT.replace('../src/api/client', specifier);

      expect(await ruleIdsFor(code, OUTSIDE_API_FOLDER)).toContain(
        'no-restricted-imports',
      );
    },
  );

  it('allows createApiClient inside src/api, where the tests live', async () => {
    const code = BUILD_OWN_CLIENT.replace('../src/api/client', './client');

    expect(await ruleIdsFor(code, OUTSIDE_CLIENT)).not.toContain(
      'no-restricted-imports',
    );
  });
});
