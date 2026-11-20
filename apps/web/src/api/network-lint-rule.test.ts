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
const SENTRY_TUNNEL = 'src/observability/sentry-tunnel.ts';
const AUTH_FILE = 'src/auth/web-public-url.ts';
const AUTH_PAGE = 'app/auth/page.tsx';
const REDIRECT_TO = 'src/auth/redirect-to.ts';
const REDIRECT_ALLOWLIST = [
  REDIRECT_TO,
  'src/anime/resolve-tab.ts',
  'src/anime/season-redirect.ts',
];

const RAW_FETCH_CALLS = [
  "await fetch('http://127.0.0.1:3001/health');",
  "await globalThis.fetch('http://127.0.0.1:3001/health');",
  "await window.fetch('http://127.0.0.1:3001/health');",
  "await self.fetch('http://127.0.0.1:3001/health');",
  "await global.fetch('http://127.0.0.1:3001/health');",
  'const { fetch: rawFetch } = globalThis;\nawait rawFetch("/health");',
  "new XMLHttpRequest().open('GET', '/health');",
  "new EventSource('/events').close();",
  "new WebSocket('ws://127.0.0.1:3001').close();",
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

  it('allows only the fetch global in the Sentry tunnel (ADR 0003 addendum)', async () => {
    const isBareFetch = (code: string) => /\bawait fetch\(/.test(code);
    const [bareFetch, ...unexpected] = RAW_FETCH_CALLS.filter(isBareFetch);
    const others = RAW_FETCH_CALLS.filter((code) => !isBareFetch(code));
    expect(bareFetch).toBeDefined();
    expect(unexpected).toEqual([]);

    expect(await ruleIdsFor(bareFetch ?? '', SENTRY_TUNNEL)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(NETWORK_RULE)]),
    );
    for (const code of others) {
      expect(await ruleIdsFor(code, SENTRY_TUNNEL)).toEqual(
        expect.arrayContaining([expect.stringMatching(NETWORK_RULE)]),
      );
    }
  });

  describe('auth gate: credential calls only through credentialCall()', () => {
    it.each([
      "import { apiClient } from '../api/client';\nexport const build = apiClient;\n",
      "import { createApiClient } from '../api/client.ts';\nexport const build = createApiClient;\n",
      "import { request } from 'node:http';\nexport const send = request;\n",
    ])('forbids in auth code:\n%s', async (code) => {
      expect(await ruleIdsFor(code, AUTH_FILE)).toContain(
        'no-restricted-imports',
      );
    });

    it('forbids apiClient in the auth pages too', async () => {
      const code = `import { apiClient } from '../../src/api/client';\nexport const build = apiClient;\n`;

      expect(await ruleIdsFor(code, AUTH_PAGE)).toContain(
        'no-restricted-imports',
      );
    });

    it.each([
      ['src/auth/credential-call.ts', 'import { apiClient }', 'apiClient'],
      [AUTH_FILE, 'import type { ApiResult }', '{} as ApiResult<string>'],
    ])('allows in %s: %s', async (filePath, imported, exported) => {
      const code = `${imported} from '../api/client';\nexport const build = ${exported};\n`;

      expect(await ruleIdsFor(code, filePath)).not.toContain(
        'no-restricted-imports',
      );
    });
  });

  describe('redirect gate: redirect() only in the three allowlisted files', () => {
    const REDIRECT_IMPORTS = [
      "import { redirect } from 'next/navigation';\nexport const leave = redirect;\n",
      "import { permanentRedirect as leave } from 'next/navigation';\nexport const go = leave;\n",
      "import * as navigation from 'next/navigation';\nexport const leave = navigation.redirect;\n",
      "export { redirect } from 'next/navigation';\n",
      "export * from 'next/navigation';\n",
      "import { redirect } from 'next/dist/client/components/navigation';\nexport const leave = redirect;\n",
      // next is CommonJS with no exports map: its default is the whole module, '.js' loads it too.
      "import navigation from 'next/navigation.js';\nexport const leave = navigation.redirect;\n",
      "import { default as navigation } from 'next/navigation';\nexport const leave = navigation.redirect;\n",
      "import { 'redirect' as leave } from 'next/navigation';\nexport const go = leave;\n",
      "import { redirect } from '../../node_modules/next/navigation';\nexport const leave = redirect;\n",
    ];
    // Banned in the allowlisted files too: only a named redirect import is freed there.
    const NEVER_ALLOWED = REDIRECT_IMPORTS.slice(2, 8);
    const everywhere = (files: readonly string[], codes: readonly string[]) =>
      files.flatMap((file) => codes.map((code) => [file, code] as const));

    it.each(
      everywhere([OUTSIDE_API_FOLDER, AUTH_FILE, AUTH_PAGE], REDIRECT_IMPORTS),
    )('fires in %s:\n%s', async (filePath, code) => {
      expect(await ruleIdsFor(code, filePath)).toContain('no-restricted-syntax');
    });

    it.each([OUTSIDE_API_FOLDER, CLIENT])(
      'allows the other next/navigation exports in %s',
      async (filePath) => {
        const code =
          "import { notFound, RedirectType, unstable_rethrow, usePathname } from 'next/navigation';\n" +
          'export const used = [notFound, RedirectType, unstable_rethrow, usePathname];\n';

        expect(await ruleIdsFor(code, filePath)).not.toContain(
          'no-restricted-syntax',
        );
      },
    );

    it.each(everywhere(REDIRECT_ALLOWLIST, NEVER_ALLOWED))(
      'fires in the allowlisted %s:\n%s',
      async (filePath, code) => {
        expect(await ruleIdsFor(code, filePath)).toContain(
          'no-restricted-syntax',
        );
      },
    );

    it.each([
      ...everywhere([OUTSIDE_API_FOLDER, AUTH_FILE], [
        "import type { RedirectType } from 'next/navigation';\nexport type Kind = RedirectType;\n",
        "import { type redirect } from 'next/navigation';\nexport type Leave = typeof redirect;\n",
        "export type * from 'next/navigation';\n",
      ]),
      ...everywhere(REDIRECT_ALLOWLIST, REDIRECT_IMPORTS.slice(0, 2)),
    ])(
      'allows in %s:\n%s',
      async (filePath, code) => {
        expect(await ruleIdsFor(code, filePath)).not.toContain(
          'no-restricted-syntax',
        );
      },
    );
  });

  describe('dynamic import gate: a literal import() of a gated module is refused', () => {
    const importing = (source: string, before = '') =>
      `${before}export async function load(): Promise<unknown> {\n  return await import(${source});\n}\n`;
    const NAME = "const name = 'next/navigation';\n";

    it.each([
      [OUTSIDE_API_FOLDER, importing("'next/navigation'")],
      [REDIRECT_TO, importing("'next/navigation'")],
      [AUTH_FILE, importing("'../api/client'")],
      [AUTH_FILE, importing("'../api/client.ts'")],
      [AUTH_FILE, importing("'@/src/api/client'")],
      [AUTH_PAGE, importing("'../../src/api/client'")],
      ['src/anime/resolve-tab.ts', importing("'../api/client'")],
      ['src/anime/season-redirect.ts', importing('name', NAME)],
      [OUTSIDE_API_FOLDER, importing("'node:https'")],
      [AUTH_FILE, importing("'undici'")],
      [OUTSIDE_CLIENT, importing("'http'")],
      [OUTSIDE_API_FOLDER, importing('name', NAME)],
      [OUTSIDE_API_FOLDER, importing('`next/${name}`', NAME)],
    ])('fires in %s:\n%s', async (filePath, code) => {
      expect(await ruleIdsFor(code, filePath)).toContain('no-restricted-syntax');
    });

    it.each([
      // Inside src/api, './client' is the client's own folder (its tests reset modules so).
      [OUTSIDE_CLIENT, importing("'./client'")],
      [AUTH_FILE, importing("'./credential-call'")],
    ])('allows in %s:\n%s', async (filePath, code) => {
      expect(await ruleIdsFor(code, filePath)).not.toContain(
        'no-restricted-syntax',
      );
    });

    it.each([
      "const navigation: unknown = require('next/navigation');\nexport const leave = navigation;\n",
      "import navigation = require('next/navigation');\nexport const leave = navigation;\n",
    ])('leaves require() to no-require-imports:\n%s', async (code) => {
      expect(await ruleIdsFor(code, OUTSIDE_API_FOLDER)).toContain(
        '@typescript-eslint/no-require-imports',
      );
    });
  });

  it('ignores eslint-disable comments in auth code, not elsewhere', async () => {
    const code =
      "// eslint-disable-next-line no-restricted-syntax\nimport { redirect } from 'next/navigation';\n" +
      'export const leave = redirect;\n';

    expect(await ruleIdsFor(code, AUTH_FILE)).toContain('no-restricted-syntax');
    expect(await ruleIdsFor(code, OUTSIDE_API_FOLDER)).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('allows createApiClient inside src/api, where the tests live', async () => {
    const code = BUILD_OWN_CLIENT.replace('../src/api/client', './client');

    expect(await ruleIdsFor(code, OUTSIDE_CLIENT)).not.toContain(
      'no-restricted-imports',
    );
  });
});
