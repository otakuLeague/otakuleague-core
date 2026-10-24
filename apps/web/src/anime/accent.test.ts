// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ACCENT,
  MIN_TEXT_CONTRAST,
  THEME_GROUNDS,
  THEME_SURFACES,
  accentPalette,
  contrastRatio,
  mixOklab,
  readableOn,
} from './accent';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    // #767676 on white is the classic smallest grey that passes AA.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });
});

describe('readableOn', () => {
  it('keeps a colour that already reads on the ground', () => {
    expect(readableOn('#4fd1b5', [THEME_GROUNDS.dark])).toBe('#4fd1b5');
  });

  it('lightens a dark colour on the dark ground and darkens a light one on the light ground', () => {
    const navy = '#1a2b5f';
    const onDark = readableOn(navy, [THEME_GROUNDS.dark]);
    expect(contrastRatio(onDark, THEME_GROUNDS.dark)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(onDark, '#ffffff')).toBeLessThan(
      contrastRatio(navy, '#ffffff'),
    );

    const onLight = readableOn('#4fd1b5', [THEME_GROUNDS.light]);
    expect(contrastRatio(onLight, THEME_GROUNDS.light)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it('reads on every background given', () => {
    const backgrounds = ['#ffffff', '#cccccc'] as const;
    const ink = readableOn('#ff9a5a', [...backgrounds]);
    for (const background of backgrounds) {
      expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
  });

  it('changes the colour only as much as needed', () => {
    const ink = readableOn('#1a2b5f', [THEME_GROUNDS.dark]);
    expect(contrastRatio(ink, THEME_GROUNDS.dark)).toBeLessThan(
      MIN_TEXT_CONTRAST + 0.2,
    );
  });
});

describe('accentPalette', () => {
  it('reaches 4.5:1 on both grounds for every kind of cover colour', () => {
    for (const cover of [
      '#000000',
      '#ffffff',
      '#e4504d',
      '#f1a143',
      '#a1c6e4',
      '#1a2b5f',
      '#5d1a8b',
      '#7a7a7a',
    ]) {
      const palette = accentPalette(cover);
      expect(
        contrastRatio(palette.inkDark, THEME_GROUNDS.dark),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.inkLight, THEME_GROUNDS.light),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.onAccent, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps accent text at 4.5:1 on every background it is drawn on, across the colour space', () => {
    const steps = [0, 0x33, 0x66, 0x99, 0xcc, 0xff, 0x1a, 0xe4, 0x5d];
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const cover = `#${hex(r)}${hex(g)}${hex(b)}`;
          const palette = accentPalette(cover);
          for (const [theme, ink] of [
            ['dark', palette.inkDark],
            ['light', palette.inkLight],
          ] as const) {
            const ground = THEME_GROUNDS[theme];
            const surface = THEME_SURFACES[theme];
            // anime-page.css: the hero's 7% top, pills and icon buttons at 14% on the surface.
            for (const background of [
              ground,
              surface,
              mixOklab(palette.accent, ground, 0.07),
              mixOklab(palette.accent, surface, 0.14),
            ]) {
              const ratio = contrastRatio(ink, background);
              if (ratio < MIN_TEXT_CONTRAST) {
                expect({ cover, theme, background, ratio }).toBe('readable');
              }
            }
          }
        }
      }
    }
  });

  it('falls back to teal when the colour is missing or not "#rrggbb"', () => {
    for (const cover of [
      null,
      '',
      'red',
      '#fff',
      '#12345g',
      'url(x)',
      '#4fd1b5;}',
    ]) {
      expect(accentPalette(cover).accent).toBe(FALLBACK_ACCENT);
    }
  });

  it('puts white text on a dark accent and dark text on a light one', () => {
    expect(accentPalette('#1a2b5f').onAccent).toBe('#ffffff');
    expect(accentPalette('#f1a143').onAccent).toBe('#12101a');
    // Mid grey: under 4.5:1 with #12101a and with white, so pure black.
    expect(accentPalette('#7a7a7a').onAccent).toBe('#000000');
  });

  it('normalises the case', () => {
    expect(accentPalette('#E4504D').accent).toBe('#e4504d');
  });

  it('gives the same palette for upper and lower case input', () => {
    expect(accentPalette('#5D1A8B')).toEqual(accentPalette('#5d1a8b'));
  });
});
