// Theme preference (OTA-152, design OTA-151): System / Light / Dark, remembered in a cookie.
// System removes `data-theme` from <html> so tokens.css follows `prefers-color-scheme`.

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_COOKIE = 'ol-theme';
export const THEME_CHANGE_EVENT = 'ol-theme-change';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Reads the preference from a `document.cookie` string; anything unknown is System. */
export function themeFromCookieHeader(cookieHeader: string): ThemePreference {
  for (const pair of cookieHeader.split(';')) {
    const [name, value] = pair.trim().split('=');
    if (name === THEME_COOKIE) return parseThemePreference(value);
  }
  return 'system';
}

/** The `document.cookie` assignment that stores a preference; System clears the cookie. */
export function themeCookieAssignment(preference: ThemePreference): string {
  const maxAge = preference === 'system' ? 0 : ONE_YEAR_SECONDS;
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/** The radio that arrow keys move to, wrapping at both ends like native radios. */
export function adjacentTheme(
  current: ThemePreference,
  step: 1 | -1,
): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  const next =
    (index + step + THEME_PREFERENCES.length) % THEME_PREFERENCES.length;
  return THEME_PREFERENCES[next] ?? current;
}

/**
 * Inline script for <head>: applies the stored theme before first paint, so there is no flash
 * of the wrong theme. A script (not a server-read cookie) keeps the root layout static under
 * Partial Prerendering (ADR 0003).
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.setAttribute('data-theme',m[1]);}catch(e){}})();`;

/** Applies a preference to the page, stores it and tells every theme control to update. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  document.cookie = themeCookieAssignment(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
