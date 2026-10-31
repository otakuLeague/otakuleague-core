'use client';

import { type KeyboardEvent, useId, useRef, useSyncExternalStore } from 'react';
import {
  THEME_CHANGE_EVENT,
  THEME_LABELS,
  THEME_PREFERENCES,
  type ThemePreference,
  adjacentTheme,
  applyThemePreference,
  themeFromCookieHeader,
} from './theme';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

const readPreference = (): ThemePreference =>
  themeFromCookieHeader(document.cookie);
// The server can't see the cookie without making the layout dynamic, so it renders System;
// React swaps in the stored value right after hydration (the page colours are already right).
const serverPreference = (): ThemePreference => 'system';

/**
 * System / Light / Dark radio group (one tab stop, ← → move and select). Every instance
 * (footer, account menu, mobile sheet) shows the same value.
 */
export function ThemeSwitch({ label = 'Theme' }: { label?: string }) {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    serverPreference,
  );
  const labelId = useId();
  const radios = useRef<Partial<Record<ThemePreference, HTMLButtonElement>>>(
    {},
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = adjacentTheme(preference, step);
    applyThemePreference(next);
    radios.current[next]?.focus();
  }

  return (
    <div className="sh-theme">
      <span className="ol-label" id={labelId}>
        {label}
      </span>
      <div
        className="sh-seg"
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
      >
        {THEME_PREFERENCES.map((option) => (
          <button
            key={option}
            ref={(element) => {
              if (element) radios.current[option] = element;
            }}
            type="button"
            role="radio"
            aria-checked={option === preference}
            tabIndex={option === preference ? 0 : -1}
            onClick={() => applyThemePreference(option)}
          >
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
