import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.mjs';

// The base already ships typescript-eslint's type-checked rules, a superset of
// eslint-config-next/typescript, so only the Next.js and React rules are added here.
export default defineConfig([...nextVitals, base]);
