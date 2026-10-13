import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

// Resolve the package by its own name (self-reference through "exports"), so the
// test exercises the published dist surface, not the TypeScript source.
const PACKAGE_NAME = '@otakuleague/shared-types';
const require = createRequire(import.meta.url);

interface SharedTypesModule {
  readonly APP_NAME: unknown;
}

interface PackageManifest {
  readonly types: string;
  readonly exports: { readonly '.': { readonly types: string } };
}

// node:test returns promises from describe/it; the runner awaits them itself.
void describe('@otakuleague/shared-types published surface', () => {
  void it('exposes APP_NAME as "OtakuLeague" to CommonJS consumers via require()', () => {
    const sharedTypes = require(PACKAGE_NAME) as SharedTypesModule;

    assert.equal(sharedTypes.APP_NAME, 'OtakuLeague');
  });

  void it('exposes APP_NAME as "OtakuLeague" to ESM consumers via import()', async () => {
    const sharedTypes = (await import(PACKAGE_NAME)) as SharedTypesModule;

    assert.equal(sharedTypes.APP_NAME, 'OtakuLeague');
  });

  void it('ships the declaration file that package.json "types" and "exports" point to', () => {
    const manifestUrl = new URL('../package.json', import.meta.url);
    const manifest = JSON.parse(
      readFileSync(manifestUrl, 'utf8'),
    ) as PackageManifest;

    assert.equal(manifest.exports['.'].types, manifest.types);
    assert.ok(
      existsSync(new URL(`../${manifest.types}`, import.meta.url)),
      `missing declaration file ${manifest.types}; run the package build`,
    );
  });
});
