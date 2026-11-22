import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SpoilerTags } from './spoiler-tags';

const spoilers = [
  { name: 'Time Skip', rank: 90, visibility: 'spoiler' as const },
  { name: 'Twist Ending', rank: 70, visibility: 'spoiler' as const },
];

describe('SpoilerTags', () => {
  afterEach(cleanup);

  it('keeps spoiler names out of the DOM until shown, and flips aria-expanded', () => {
    const { container } = render(<SpoilerTags id="sp" tags={spoilers} />);
    const toggle = screen.getByRole('button', {
      name: 'Show spoiler tags (2)',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('sp');
    expect(container.querySelector('#sp')).toBeTruthy();
    expect(container.textContent).not.toContain('Time Skip');
    expect(container.firstElementChild?.getAttribute('data-state')).toBe(
      'hidden',
    );

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide spoiler tags');
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Time Skip, relevance 90%', 'Twist Ending, relevance 70%']);

    fireEvent.click(toggle);
    expect(container.textContent).not.toContain('Time Skip');
  });
});
