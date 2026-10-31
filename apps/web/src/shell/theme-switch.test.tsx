import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './theme-switch';

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

describe('ThemeSwitch', () => {
  afterEach(() => {
    cleanup();
    document.cookie = 'ol-theme=; Path=/; Max-Age=0';
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to System with a single tab stop', () => {
    render(<ThemeSwitch />);

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeDefined();
    expect(radio('System').getAttribute('aria-checked')).toBe('true');
    expect(radio('System').tabIndex).toBe(0);
    expect(radio('Light').tabIndex).toBe(-1);
    expect(radio('Dark').tabIndex).toBe(-1);
  });

  it('shows the remembered preference', () => {
    document.cookie = 'ol-theme=dark; Path=/';
    render(<ThemeSwitch />);

    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it('selects on click, applies the theme and remembers it', () => {
    render(<ThemeSwitch />);

    fireEvent.click(radio('Light'));

    expect(radio('Light').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.cookie).toContain('ol-theme=light');
  });

  it('moves and selects with arrow keys, wrapping, and keeps focus on the selection', () => {
    render(<ThemeSwitch />);

    fireEvent.keyDown(radio('System'), { key: 'ArrowLeft' });

    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio('Dark'));

    fireEvent.keyDown(radio('Dark'), { key: 'ArrowRight' });

    expect(radio('System').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('moves from the focused radio, not the selection', () => {
    render(<ThemeSwitch />);

    fireEvent.keyDown(radio('Light'), { key: 'ArrowRight' });

    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps every instance in sync (footer, account menu, sheet)', () => {
    render(
      <>
        <ThemeSwitch label="Footer theme" />
        <ThemeSwitch label="Menu theme" />
      </>,
    );

    const footer = screen.getByRole('radiogroup', { name: 'Footer theme' });
    fireEvent.click(within(footer).getByRole('radio', { name: 'Dark' }));

    for (const darkRadio of screen.getAllByRole('radio', { name: 'Dark' })) {
      expect(darkRadio.getAttribute('aria-checked')).toBe('true');
    }
  });
});
