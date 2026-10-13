import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.mjs';

const NETWORK_RULE_MESSAGE =
  'All network calls go through src/api/client.ts (ADR 0003).';

const NETWORK_IMPORTS = [
  'http',
  'https',
  'node:http',
  'node:https',
  'undici',
].map((name) => ({ name, message: NETWORK_RULE_MESSAGE }));

// The base already ships typescript-eslint's type-checked rules, a superset of
// eslint-config-next/typescript, so only the Next.js and React rules are added here.
export default defineConfig([
  ...nextVitals,
  base,
  {
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map(
          (name) => ({ name, message: NETWORK_RULE_MESSAGE }),
        ),
      ],
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
    files: ['src/api/**'],
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: NETWORK_IMPORTS }],
    },
  },
]);
