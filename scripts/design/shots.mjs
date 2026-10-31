// Screenshots every mockup-*.html in a design folder at desktop and mobile widths.
// Usage: node scripts/design/shots.mjs docs/design/<page>
// Needs Playwright with Chromium: preinstalled in Claude cloud sessions; on a Mac run
// `npx playwright install chromium` once.
import console from 'node:console';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/design/shots.mjs docs/design/<page>');
  process.exit(1);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright not found. Run: npx playwright install chromium (and npm i -g playwright).');
  process.exit(1);
}
const pages = readdirSync(dir).filter((name) => /^mockup-.*\.html$/.test(name));
if (pages.length === 0) {
  console.error(`No mockup-*.html in ${dir}`);
  process.exit(1);
}
const out = join(dir, 'shots');
mkdirSync(out, { recursive: true });
const viewports = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
];
const browser = await chromium.launch();
try {
  for (const name of pages) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(join(dir, name)).href, { waitUntil: 'networkidle' });
      const file = join(out, `${basename(name, '.html')}-${viewport.label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      console.log(file);
    }
  }
} finally {
  await browser.close();
}
