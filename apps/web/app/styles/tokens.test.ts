// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_TEXT_CONTRAST,
  contrastRatio,
  mixOklab,
} from '../../src/anime/accent';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** The custom properties declared in the block that opens with `selector {`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name!, value!.trim()] as const,
    ),
  );
}

const dark = block(":root,\n[data-theme='dark']");
const light = block("[data-theme='light']");
const systemLight = block("  :root:not([data-theme='dark'])");
const statuses = block(':root,\n[data-theme]');

/** A token's colour in a theme, following one level of var() alias. */
function resolve(theme: Map<string, string>, name: string): string {
  const value = theme.get(name) ?? statuses.get(name);
  const alias = /^var\((--[\w-]+)\)$/.exec(value ?? '');
  const color = alias ? theme.get(alias[1]!) : value;
  if (!color) throw new Error(`${name} has no value`);
  return color;
}

const CHIP_TOKENS = [
  '--status-airing',
  '--status-finished',
  '--status-upcoming',
  '--status-hiatus',
  '--status-cancelled',
  '--season-spring',
  '--season-summer',
  '--season-fall',
  '--season-winter',
];

describe('design tokens', () => {
  it('keeps the system light theme identical to [data-theme="light"]', () => {
    expect(Object.fromEntries(systemLight)).toEqual(Object.fromEntries(light));
  });

  // A token only in the dark block would leak its dark value into the light theme.
  it('declares the same tokens in the dark and light themes', () => {
    expect([...light.keys()].sort()).toEqual([...dark.keys()].sort());
  });

  it('checks the contrast of every status and season colour declared', () => {
    const declared = [...dark.keys(), ...statuses.keys()].filter((name) =>
      /^--(status|season)-/.test(name),
    );
    expect(declared.sort()).toEqual([...CHIP_TOKENS].sort());
  });

  it.each([
    ['dark', dark],
    ['light', light],
  ])(
    'reads every status and season chip at 4.5:1 in the %s theme',
    (_, theme) => {
      const surface = resolve(theme, '--surface');
      for (const token of CHIP_TOKENS) {
        const color = resolve(theme, token);
        // The chip's fill: color-mix(in oklab, <colour> 14%, var(--surface)).
        const fill = mixOklab(color, surface, 0.14);
        expect({
          token,
          ratio: contrastRatio(color, fill) >= MIN_TEXT_CONTRAST,
        }).toEqual({ token, ratio: true });
      }
    },
  );
});
