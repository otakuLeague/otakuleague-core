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

// esquery ends a selector regex at its first "/", so a slash inside one is written /.
// next has no exports map: 'next/navigation.js' and next/dist load the same redirect().
const NEXT_NAVIGATION = '/^next\\u002Fnavigation(\\.js)?$/';
// A CommonJS module's default import is the whole module, redirect() included.
const REDIRECT_NAMES = '/^(redirect|permanentRedirect|default)$/';
const REDIRECT_MESSAGE =
  'Redirect through redirectTo() (src/auth/redirect-to.ts), which takes only a SafeNextPath (ADR 0015 Addendum 1f-iii-c).';

/** @param {[string, string][]} rows selector, message */
const syntaxBans = (rows) =>
  rows.map(([selector, message]) => ({ selector, message }));

const REDIRECT_SELECTORS = syntaxBans(
  [
    `ImportDeclaration[source.value=${NEXT_NAVIGATION}] > ImportSpecifier:matches([imported.name=${REDIRECT_NAMES}], [imported.value=${REDIRECT_NAMES}])`,
    `ImportDeclaration[source.value=${NEXT_NAVIGATION}] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)`,
    `ExportNamedDeclaration[source.value=${NEXT_NAVIGATION}] > ExportSpecifier:matches([local.name=${REDIRECT_NAMES}], [local.value=${REDIRECT_NAMES}])`,
    `ExportAllDeclaration[source.value=${NEXT_NAVIGATION}]`,
    ':matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration)[source.value=/^next\\u002Fdist\\u002F/]',
  ].map((selector) => [selector, REDIRECT_MESSAGE]),
);

// L3: a dynamic import() is invisible to no-restricted-imports and to the selectors above. Inside
// src/api, import('./client') stays allowed: the client's own folder (its tests reset modules so).
const DYNAMIC_IMPORT_SELECTORS = syntaxBans([
  [
    'ImportExpression[source.value=/^next\\u002F(navigation|dist\\u002F)/]',
    'Import next/navigation statically, so the redirect gate can see it (ADR 0015 Addendum 1f-iii-c).',
  ],
  [
    'ImportExpression[source.value=/(^|\\u002F)api\\u002Fclient(\\.\\w+)?$/]',
    'Import the API client statically, so the network and auth gates can see it (ADR 0003).',
  ],
  [
    "ImportExpression[source.type!='Literal']",
    'import() takes a string literal only, so the lint gates can see what it loads.',
  ],
]);

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
              group: ['**/api/client'],
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
    // Auth code calls the API only through credentialCall(), which always sends the key and the
    // client IP and refuses previews (ADR 0003 OTA-139 addendum). A later block replaces the rule's
    // options, so the network imports are repeated here.
    files: ['src/auth/**', 'app/auth/**'],
    ignores: ['src/auth/credential-call.ts'],
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
                'Auth code calls the API through credentialCall() (src/auth/credential-call.ts).',
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
        ...REDIRECT_SELECTORS,
        ...DYNAMIC_IMPORT_SELECTORS,
      ],
    },
  },
  {
    // The only redirect() callers. The two anime files redirect to tabHref() built from the
    // API-validated canonical slug, never from request input. This block replaces the options
    // above for these files, so the dynamic import() gate is repeated: it applies everywhere.
    files: [
      'src/auth/redirect-to.ts',
      'src/anime/resolve-tab.ts',
      'src/anime/season-redirect.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...DYNAMIC_IMPORT_SELECTORS],
    },
  },
]);
