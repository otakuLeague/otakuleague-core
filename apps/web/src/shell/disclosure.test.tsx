import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Disclosure } from './disclosure';

function renderMenu(props: Partial<Parameters<typeof Disclosure>[0]> = {}) {
  render(
    <>
      <Disclosure summary="Discover" summaryClassName="sh-nav__link" {...props}>
        <ul>
          <li>
            <a href="/discover/airing">Top airing</a>
          </li>
          <li>
            <a href="/discover/upcoming">Top upcoming</a>
          </li>
        </ul>
      </Disclosure>
      <button type="button">Outside</button>
    </>,
  );
  const summary = screen.getByText('Discover');
  const details = summary.closest('details');
  if (details === null) throw new Error('no <details> rendered');
  return { summary, details };
}

function openMenu() {
  const menu = renderMenu();
  fireEvent.click(menu.summary);
  expect(menu.details.open).toBe(true);
  return menu;
}

describe('Disclosure', () => {
  afterEach(cleanup);

  it('is a closed native disclosure in the exclusive header group', () => {
    const { details, summary } = renderMenu();

    expect(details.open).toBe(false);
    expect(details.getAttribute('name')).toBe('sh-menu');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.hasAttribute('data-active')).toBe(false);
    expect(details.querySelector('.sh-pop.sh-menu')).not.toBeNull();
  });

  it('marks the active section', () => {
    const { summary } = renderMenu({ active: true });

    expect(summary.hasAttribute('data-active')).toBe(true);
  });

  it('opens and closes on its summary', () => {
    const { details, summary } = openMenu();

    fireEvent.click(summary);
    expect(details.open).toBe(false);
  });

  it('closes on Esc and returns focus to the summary', () => {
    const { details, summary } = openMenu();
    const link = screen.getByRole('link', { name: 'Top upcoming' });
    link.focus();

    fireEvent.keyDown(link, { key: 'Escape' });

    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('closes on Esc when focus is outside it (opened with the mouse)', () => {
    const { details, summary } = openMenu();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('ignores other keys', () => {
    const { details } = openMenu();

    fireEvent.keyDown(screen.getByRole('link', { name: 'Top airing' }), {
      key: 'ArrowDown',
    });

    expect(details.open).toBe(true);
  });

  it('closes on a pointer down outside, not inside', () => {
    const { details } = openMenu();

    fireEvent.pointerDown(screen.getByRole('link', { name: 'Top airing' }));
    expect(details.open).toBe(true);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(details.open).toBe(false);
  });

  it('closes when focus moves outside, not between its items', () => {
    const { details } = openMenu();
    const first = screen.getByRole('link', { name: 'Top airing' });
    const second = screen.getByRole('link', { name: 'Top upcoming' });

    fireEvent.blur(first, { relatedTarget: second });
    expect(details.open).toBe(true);

    fireEvent.blur(second, { relatedTarget: null });
    expect(details.open).toBe(true);

    fireEvent.blur(second, {
      relatedTarget: screen.getByRole('button', { name: 'Outside' }),
    });
    expect(details.open).toBe(false);
  });

  it('closes when one of its links is followed (soft navigation)', () => {
    const { details } = openMenu();
    const link = screen.getByRole('link', { name: 'Top airing' });
    link.addEventListener('click', (event) => event.preventDefault());

    fireEvent.click(link);

    expect(details.open).toBe(false);
  });
});
