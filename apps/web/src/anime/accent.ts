/**
 * The anime page's accent (OTA-97): the cover's dominant colour, with text colours derived from
 * it so text keeps WCAG AA contrast (4.5:1) on every background it is drawn on, per theme.
 */

export const FALLBACK_ACCENT = '#4fd1b5';
/** The `--ground` and `--surface` of each theme in tokens.css. */
export const THEME_GROUNDS = { dark: '#12101a', light: '#f3efe6' } as const;
export const THEME_SURFACES = { dark: '#1b1826', light: '#fbf9f4' } as const;
const DARK_TEXT = '#12101a';
const LIGHT_TEXT = '#ffffff';
export const MIN_TEXT_CONTRAST = 4.5;

type Rgb = readonly [number, number, number];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  ) as unknown as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#rrggbb" colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `amount` (0-1) of `towards` mixed into `from`, in sRGB. */
function mix(from: string, towards: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(towards);
  return toHex(
    a.map(
      (channel, i) => channel + (b[i]! - channel) * amount,
    ) as unknown as Rgb,
  );
}

/**
 * The colour closest to `color` that reads at 4.5:1 on every one of `backgrounds` (all dark or
 * all light): unchanged when it already does, else mixed towards white (dark backgrounds) or
 * black (light ones) just enough.
 */
export function readableOn(
  color: string,
  backgrounds: readonly [string, ...string[]],
): string {
  const reads = (candidate: string) =>
    backgrounds.every(
      (background) => contrastRatio(candidate, background) >= MIN_TEXT_CONTRAST,
    );
  if (reads(color)) return color;
  const towards =
    relativeLuminance(backgrounds[0]) < 0.5 ? '#ffffff' : '#000000';
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const middle = (low + high) / 2;
    if (reads(mix(color, towards, middle))) high = middle;
    else low = middle;
  }
  return mix(color, towards, high);
}

/**
 * The design's dark text, else white, else pure black: a mid-tone accent (luminance about
 * 0.18-0.20) is under 4.5:1 with both of the first two, never with black or white.
 */
function textOn(fill: string): string {
  return (
    [DARK_TEXT, LIGHT_TEXT].find(
      (text) => contrastRatio(text, fill) >= MIN_TEXT_CONTRAST,
    ) ?? '#000000'
  );
}

// color-mix(in oklab, ...) as the browser computes it, for opaque sRGB colours.
type Vector = readonly [number, number, number];
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const multiply = (m: readonly Vector[], v: Vector): Vector => [
  m[0]![0] * v[0] + m[0]![1] * v[1] + m[0]![2] * v[2],
  m[1]![0] * v[0] + m[1]![1] * v[1] + m[1]![2] * v[2],
  m[2]![0] * v[0] + m[2]![1] * v[1] + m[2]![2] * v[2],
];
const RGB_TO_LMS: readonly Vector[] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_LAB: readonly Vector[] = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const LAB_TO_LMS: readonly Vector[] = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LMS_TO_RGB: readonly Vector[] = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const cube = ([a, b, c]: Vector): Vector => [a ** 3, b ** 3, c ** 3];
const cubeRoot = ([a, b, c]: Vector): Vector => [
  Math.cbrt(a),
  Math.cbrt(b),
  Math.cbrt(c),
];

function toOklab(hex: string): Vector {
  const [r, g, b] = parseHex(hex);
  return multiply(
    LMS_TO_LAB,
    cubeRoot(
      multiply(RGB_TO_LMS, [
        toLinear(r / 255),
        toLinear(g / 255),
        toLinear(b / 255),
      ]),
    ),
  );
}

function fromOklab(lab: Vector): string {
  const [r, g, b] = multiply(LMS_TO_RGB, cube(multiply(LAB_TO_LMS, lab)));
  const channel = (c: number) => Math.min(1, Math.max(0, fromLinear(c))) * 255;
  return toHex([channel(r), channel(g), channel(b)]);
}

/** `color-mix(in oklab, <color> <amount>, <base>)`, `amount` from 0 to 1. */
export function mixOklab(color: string, base: string, amount: number): string {
  const a = toOklab(color);
  const b = toOklab(base);
  const at = (i: 0 | 1 | 2) => a[i] * amount + b[i] * (1 - amount);
  return fromOklab([at(0), at(1), at(2)]);
}

/** The accent tints accent text sits on, in anime-page.css: the hero's top and pill/button fills. */
const HERO_TINT = 0.07;
const FILL_TINT = 0.14;

/**
 * Accent text that reads on every background it is drawn on in a theme: the ground, the
 * surface, the hero's accent-tinted top and the accent-tinted fills (current sticky pill,
 * icon buttons, accent chips).
 */
function inkOn(accent: string, theme: 'dark' | 'light'): string {
  const ground = THEME_GROUNDS[theme];
  const surface = THEME_SURFACES[theme];
  return readableOn(accent, [
    ground,
    surface,
    mixOklab(accent, ground, HERO_TINT),
    mixOklab(accent, surface, FILL_TINT),
  ]);
}

export interface AccentPalette {
  /** Decoration: neon line, glow, borders, the primary button's fill. */
  readonly accent: string;
  /** Text on the accent fill (the primary button). */
  readonly onAccent: string;
  /** Accent-coloured text and links, per theme. */
  readonly inkDark: string;
  readonly inkLight: string;
}

/** The page palette from AniList's cover colour; teal when it is missing or malformed. */
export function accentPalette(coverColor: string | null): AccentPalette {
  const accent =
    coverColor !== null && HEX_COLOR.test(coverColor)
      ? coverColor.toLowerCase()
      : FALLBACK_ACCENT;
  return {
    accent,
    onAccent: textOn(accent),
    inkDark: inkOn(accent, 'dark'),
    inkLight: inkOn(accent, 'light'),
  };
}
