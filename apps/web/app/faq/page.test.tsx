import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FAQ_ENTRIES } from './faq-entries';
import FaqPage, { metadata } from './page';

function questions(container: HTMLElement) {
  return [...container.querySelectorAll('details')];
}

describe('FAQ page', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('renders the five questions as one exclusive accordion, the first open', () => {
    const { container } = render(<FaqPage />);

    const details = questions(container);
    expect(details.map((entry) => entry.id)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
    ]);
    expect(new Set(details.map((entry) => entry.id)).size).toBe(5);
    expect(details.every((entry) => entry.getAttribute('name') === 'faq')).toBe(
      true,
    );
    expect(details.map((entry) => entry.open)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(
      details.map((entry) => entry.querySelector('summary')?.textContent),
    ).toEqual(
      FAQ_ENTRIES.map(
        (entry, index) =>
          `${String(index + 1).padStart(2, '0')}${entry.question}`,
      ),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Anime tracking that feels like a game.',
    );
  });

  it('says it is free and ends on the two ways to reach us', () => {
    render(<FaqPage />);

    expect(screen.getByText('Is it free?')).toBeDefined();
    const write = screen.getByRole('link', { name: /Write to us/ });
    expect(write.getAttribute('href')).toBe('mailto:contact@otakuleague.com');
    const discord = screen.getByRole('link', { name: /Join the Discord/ });
    expect(discord.getAttribute('href')).toMatch(/^https:\/\/discord\.gg\//);
    expect(discord.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('titles each question with a heading and announces new-tab links in words', () => {
    const { container } = render(<FaqPage />);

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(FAQ_ENTRIES.map((entry) => entry.question));
    const newTab = [...container.querySelectorAll('a[target="_blank"]')];
    expect(newTab).toHaveLength(3);
    for (const link of newTab) {
      expect(link.textContent).toContain('(opens in a new tab)');
      expect(
        [...link.querySelectorAll('[aria-hidden="true"]')].map(
          (mark) => mark.textContent,
        ),
      ).toContain(' ↗');
    }
  });

  it('opens the answer named by the hash, on load and on a hash change', () => {
    window.history.replaceState(null, '', '/faq#q4');
    const { container } = render(<FaqPage />);

    expect(questions(container)[3]?.open).toBe(true);

    act(() => {
      window.history.replaceState(null, '', '/faq#q2');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(questions(container)[1]?.open).toBe(true);
  });

  it('ignores a hash that is not a question', () => {
    window.history.replaceState(null, '', '/faq#main');
    const { container } = render(<FaqPage />);

    expect(questions(container).map((entry) => entry.open)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('has a title, description and canonical URL', () => {
    expect(metadata.title).toBe('About us');
    expect(metadata.description).toMatch(/free/);
    expect(metadata.alternates?.canonical).toBe('/faq');
  });
});
