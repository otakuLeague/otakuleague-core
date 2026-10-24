import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Cover } from './cover';

const url =
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg';

describe('Cover', () => {
  afterEach(() => cleanup());

  it('names the hero cover after the title', () => {
    render(
      <Cover url={url} title="Attack on Titan" initials="AT" size="hero" />,
    );
    const image = screen.getByRole('img', { name: 'Attack on Titan cover' });
    expect(image.className).toBe('anime-cover anime-cover--hero');
  });

  it('keeps the mini cover decorative: the title is right next to it', () => {
    const { container } = render(
      <Cover url={url} title="Attack on Titan" initials="AT" size="mini" />,
    );
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('shows the initials on the hero placeholder without an image', () => {
    render(<Cover url={null} title="Monster" initials="M" size="hero" />);
    expect(
      screen.getByRole('img', { name: 'No cover available' }).textContent,
    ).toBe('M');
  });

  it('leaves the mini placeholder blank: initials do not fit at 34px', () => {
    const { container } = render(
      <Cover url={null} title="Monster" initials="M" size="mini" />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    const placeholder = container.querySelector('.anime-cover') as HTMLElement;
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder.textContent).toBe('');
    expect(placeholder.className).toContain('anime-cover--empty');
    expect(container.querySelector('img')).toBeNull();
  });
});
