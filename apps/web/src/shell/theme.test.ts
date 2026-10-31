import { afterEach, describe, expect, it } from 'vitest';
import {
  THEME_BOOT_SCRIPT,
  adjacentTheme,
  applyThemePreference,
  parseThemePreference,
  themeCookieAssignment,
  themeFromCookieHeader,
} from './theme';

function clearThemeCookie(): void {
  document.cookie = 'ol-theme=; Path=/; Max-Age=0';
  document.documentElement.removeAttribute('data-theme');
}

function runBootScript(): void {
  // The script is a static string from our own module (it ships inline in <head>), never input.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(THEME_BOOT_SCRIPT)();
}

describe('theme preference', () => {
  afterEach(clearThemeCookie);

  it('parses light and dark, and falls back to system for anything else', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('DARK')).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
  });

  it('reads the preference among other cookies, and system when absent or empty', () => {
    expect(themeFromCookieHeader('a=1; ol-theme=dark; b=2')).toBe('dark');
    expect(themeFromCookieHeader('ol-theme=light')).toBe('light');
    expect(themeFromCookieHeader('xol-theme=dark')).toBe('system');
    expect(themeFromCookieHeader('ol-theme=purple')).toBe('system');
    expect(themeFromCookieHeader('')).toBe('system');
  });

  it('stores light/dark for a year and clears the cookie for system', () => {
    expect(themeCookieAssignment('dark')).toBe(
      'ol-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(themeCookieAssignment('system')).toContain('Max-Age=0');
  });

  it('moves between radios and wraps at both ends', () => {
    expect(adjacentTheme('system', 1)).toBe('light');
    expect(adjacentTheme('dark', 1)).toBe('system');
    expect(adjacentTheme('system', -1)).toBe('dark');
  });

  it('applies a preference to <html> and the cookie, and system removes both', () => {
    applyThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(themeFromCookieHeader(document.cookie)).toBe('light');

    applyThemePreference('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeFromCookieHeader(document.cookie)).toBe('system');
  });

  it('boot script sets the stored theme before paint and ignores unknown values', () => {
    document.cookie = 'ol-theme=dark; Path=/';
    runBootScript();
    expect(document.documentElement.dataset.theme).toBe('dark');

    clearThemeCookie();
    document.cookie = 'ol-theme=<b>; Path=/';
    runBootScript();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
