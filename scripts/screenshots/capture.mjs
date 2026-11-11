// Screenshots every route in routes.json against a running web + API (ADR 0013).
// Never asserts on HTTP status (an error page is a valid shot), stops itself after 90 s, exits 0.
// Playwright is not a dependency: CI installs it outside the repo and sets NODE_PATH.
import console from 'node:console';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { buildComment } from './comment.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const OUT = resolve(process.env.SCREENSHOT_DIR ?? 'screenshots-out');
const TOTAL_MS = 90_000;
const SEED_MS = 25_000;
const IMAGES_MS = 5_000;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const SCHEMES = ['dark', 'light'];

const config = JSON.parse(readFileSync(join(HERE, 'routes.json'), 'utf8'));
const manifest = {
  routes: config.routes.map((route) => ({
    ...route,
    shots: VIEWPORTS.flatMap(({ width }) =>
      SCHEMES.map((scheme) => ({ width, scheme, file: null, error: 'not reached' })),
    ),
  })),
  warnings: [],
};

function finish() {
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(OUT, 'comment.md'), buildComment(manifest));
}

const reason = (error) => (error instanceof Error ? error.message : String(error)).split('\n')[0];

async function getJson(url) {
  const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(10_000) });
  return response.json();
}

/** Imports each seed through the API, then waits for the franchise walks to settle. */
async function seed() {
  const deadline = Date.now() + SEED_MS;
  const slugs = [];
  for (const malId of config.seedMalIds) {
    try {
      const details = await getJson(`${API}/anime/myanimelist/${malId}`);
      if (typeof details.canonicalSlug === 'string') slugs.push(details.canonicalSlug);
      else manifest.warnings.push(`seed ${malId}: no slug`);
    } catch (error) {
      manifest.warnings.push(`seed ${malId}: ${reason(error)}`);
    }
  }
  for (const slug of slugs) {
    while (Date.now() < deadline) {
      try {
        const franchise = await getJson(`${API}/anime/slugs/${slug}/franchise`);
        if (franchise.state !== 'walking') break;
      } catch (error) {
        manifest.warnings.push(`franchise ${slug}: ${reason(error)}`);
        break;
      }
      await sleep(1_000);
    }
  }
}

async function settle(page) {
  await page.evaluate(
    `Promise.race([Promise.all(Array.from(document.images, (img) => img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; }))), new Promise((done) => setTimeout(done, ${IMAGES_MS}))])`,
  );
}

async function capture() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      for (const scheme of SCHEMES) {
        const context = await browser.newContext({
          viewport,
          colorScheme: scheme,
          deviceScaleFactor: 1,
          timezoneId: 'UTC',
        });
        for (const route of manifest.routes) {
          const shot = route.shots.find((s) => s.width === viewport.width && s.scheme === scheme);
          const file = `${route.name}-${viewport.width}-${scheme}.png`;
          const page = await context.newPage();
          try {
            await page.goto(`${WEB}${route.path}`, { waitUntil: 'load', timeout: 20_000 });
            await settle(page);
            await page.screenshot({ path: join(OUT, file), fullPage: true, animations: 'disabled' });
            shot.file = file;
            shot.error = null;
          } catch (error) {
            shot.error = reason(error);
          } finally {
            await page.close().catch(() => undefined);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

mkdirSync(OUT, { recursive: true });
const guard = setTimeout(() => {
  manifest.warnings.push(`stopped after ${TOTAL_MS / 1000} s`);
  finish();
  console.error('capture: stopped after 90 s');
  process.exit(0);
}, TOTAL_MS);

try {
  await seed();
  await capture();
} catch (error) {
  manifest.warnings.push(`capture: ${reason(error)}`);
}
clearTimeout(guard);
finish();
console.log(`capture: ${manifest.routes.flatMap((r) => r.shots).filter((s) => s.file !== null).length} shots, ${manifest.warnings.length} warnings`);
process.exit(0);
