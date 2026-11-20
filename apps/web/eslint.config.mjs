import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.mjs';

const NETWORK_RULE_MESSAGE =
  'All network calls go through src/api/client.ts (ADR 0003).';

const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];

/** @param {string[]} names */
const restrictedGlobals = (names) =>
  names.map((name) => ({ name, message: NETWORK_RULE_MESSAGE }));

const NETWORK_IMPORTS = [
  'http',
  'https',
  'node:http',
  'node:https',
  'undici',
].map((name) => ({ name, message: NETWORK_RULE_MESSAGE }));

// esquery ends a selector regex at its first "/", so a slash inside one is written as the escape \u002F.
// next has no exports map: 'next/navigation.js' and next/dist load the same redirect().
const NEXT_NAVIGATION = '/(^|\\u002F)next\\u002Fnavigation(\\.js)?$/';
const NEXT_DIST = '/(^|\\u002F)next\\u002Fdist\\u002F/';
const REDIRECT_NAMES = '/^(redirect|permanentRedirect)$/';
const REDIRECT_MESSAGE =
  'Redirect through redirectTo() (a SafeNextPath only) or redirectToSignedOut() in src/auth/redirect-to.ts (ADR 0015 Addendum 1f-iii-c).';
// Type-only imports and exports load nothing: allowed, like the auth gate's.
const VALUE = "[importKind!='type']";
const VALUE_EXPORT = "[exportKind!='type']";
const NAVIGATION_IMPORT = `ImportDeclaration${VALUE}[source.value=${NEXT_NAVIGATION}]`;

/** @param {[string, string][]} rows selector, message */
const syntaxBans = (rows) =>
  rows.map(([selector, message]) => ({ selector, message }));

// The one form the three allowlisted files use.
const NAMED_REDIRECT_IMPORT = syntaxBans([
  [
    `${NAVIGATION_IMPORT} > ImportSpecifier${VALUE}:matches([imported.name=${REDIRECT_NAMES}], [imported.value=${REDIRECT_NAMES}])`,
    REDIRECT_MESSAGE,
  ],
]);

// Banned in the allowlisted files too. A CommonJS module's default import is the whole module.
const OTHER_REDIRECT_SELECTORS = syntaxBans([
  ...[
    `${NAVIGATION_IMPORT} > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier, ImportSpecifier${VALUE}:matches([imported.name='default'], [imported.value='default']))`,
    `ExportNamedDeclaration${VALUE_EXPORT}[source.value=${NEXT_NAVIGATION}] > ExportSpecifier${VALUE_EXPORT}:matches([local.name=/^(redirect|permanentRedirect|default)$/], [local.value=/^(redirect|permanentRedirect|default)$/])`,
    `ExportAllDeclaration${VALUE_EXPORT}[source.value=${NEXT_NAVIGATION}]`,
  ].map((selector) => [selector, REDIRECT_MESSAGE]),
  [
    `:matches(ImportDeclaration${VALUE}, ExportNamedDeclaration${VALUE_EXPORT}, ExportAllDeclaration${VALUE_EXPORT})[source.value=${NEXT_DIST}]`,
    'next/dist is internal: import the public entry (ADR 0015 Addendum 1f-iii-c).',
  ],
]);

// Dynamic import gate: import() is invisible to no-restricted-imports and to the selectors above.
// Inside src/api, import('./client') stays allowed: the client's own folder (its tests reset modules so).
const DYNAMIC_IMPORT_SELECTORS = syntaxBans([
  [
    'ImportExpression[source.value=/(^|\\u002F)next\\u002F(navigation|dist\\u002F)/]',
    'Import next/navigation statically, so the redirect gate can see it (ADR 0015 Addendum 1f-iii-c).',
  ],
  [
    'ImportExpression[source.value=/(^|\\u002F)api\\u002Fclient(\\.\\w+)?$/]',
    'Import the API client statically, so the network and auth gates can see it (ADR 0003).',
  ],
  [
    `ImportExpression[source.value=/^(${NETWORK_IMPORTS.map(({ name }) => name).join('|')})$/]`,
    NETWORK_RULE_MESSAGE,
  ],
  [
    "ImportExpression[source.type!='Literal']",
    'import() takes a string literal only, so the lint gates can see what it loads.',
  ],
]);

const REDIRECT_ALLOWLIST = [
  'src/auth/redirect-to.ts',
  'src/anime/resolve-tab.ts',
  'src/anime/season-redirect.ts',
];

// The base already ships typescript-eslint's type-checked rules, a superset of
// eslint-config-next/typescript, so only the Next.js and React rules are added here.
export default defineConfig([
  ...nextVitals,
  base,
  {
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals(NETWORK_GLOBALS)],
      'no-restricted-properties': [
        'error',
        ...['globalThis', 'window', 'self', 'global'].map((object) => ({
          object,
          property: 'fetch',
          message: NETWORK_RULE_MESSAGE,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: NETWORK_IMPORTS,
          // createApiClient takes any base URL; pages use apiClient(), built from API_BASE_URL.
          patterns: [
            {
              group: ['**/api/client', '**/api/client.*'],
              importNames: ['createApiClient'],
              message: 'Use apiClient(); only src/api builds its own client.',
            },
          ],
        },
      ],
    },
  },
  {
    // The Sentry tunnel forwards envelopes to Sentry, not to our API: the fetch global is its
    // one exception (ADR 0003 addendum, OTA-87). The other network globals stay banned.
    files: ['src/observability/sentry-tunnel.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...restrictedGlobals(
          NETWORK_GLOBALS.filter((name) => name !== 'fetch'),
        ),
      ],
    },
  },
  {
    files: ['src/api/**'],
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: NETWORK_IMPORTS }],
    },
  },
  {
    // Auth code calls the API only through credentialCall() (key and client IP) or sessionCall()
    // (key and Bearer), both refusing previews (ADR 0003 OTA-139 addendum, ADR 0015 Addendum
    // 1f-iv); never a third file. A later block replaces the rule's options, so the network imports
    // are repeated here.
    files: ['src/auth/**', 'app/auth/**'],
    ignores: ['src/auth/credential-call.ts', 'src/auth/session-call.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NETWORK_IMPORTS,
          patterns: [
            {
              group: ['**/api/client', '**/api/client.*'],
              importNames: ['apiClient', 'createApiClient'],
              message:
                'Auth code calls the API through credentialCall() or sessionCall() (src/auth/credential-call.ts, src/auth/session-call.ts).',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NAMED_REDIRECT_IMPORT,
        ...OTHER_REDIRECT_SELECTORS,
        ...DYNAMIC_IMPORT_SELECTORS,
      ],
    },
  },
  {
    // The only redirect() callers. The two anime files redirect to tabHref() built from the
    // API-validated canonical slug, never from request input. This block replaces the options
    // above for these files, so every other selector is repeated: only the named import is freed.
    files: REDIRECT_ALLOWLIST,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...OTHER_REDIRECT_SELECTORS,
        ...DYNAMIC_IMPORT_SELECTORS,
      ],
    },
  },
  {
    // An eslint-disable comment cannot switch a gate off outside tests.
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    linterOptions: { noInlineConfig: true },
  },
]);
