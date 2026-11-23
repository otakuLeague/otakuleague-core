import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmailLinkScreen } from './email-link-screen';

afterEach(cleanup);

describe('EmailLinkScreen', () => {
  it('renders a hidden check badge, the h1, one sentence and one button link', () => {
    const screenNode = render(
      <EmailLinkScreen
        tone="ok"
        heading="Email confirmed"
        sentence="Welcome to the league."
        link={{ href: '/', label: 'Continue', look: 'primary' }}
      />,
    ).container;

    const badge = screenNode.querySelector('.au-badge');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.getAttribute('data-tone')).toBe('ok');
    expect(badge?.textContent).toBe('');
    expect(
      badge?.querySelectorAll('svg[aria-hidden="true"] path'),
    ).toHaveLength(1);
    expect(badge?.querySelector('svg')?.getAttribute('stroke')).toBe(
      'currentColor',
    );
    expect(screen.getByRole('heading', { level: 1 }).tabIndex).toBe(-1);
    expect(screenNode.querySelectorAll('p.au-sub')).toHaveLength(1);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.className).toBe('ol-btn ol-btn--primary au-btn');
    expect(screenNode.querySelector('[role], [aria-live], form')).toBeNull();
  });

  it('puts a back link under the sentence with a clock badge', () => {
    const screenNode = render(
      <EmailLinkScreen
        tone="wait"
        heading="Not this time"
        sentence="Try later."
        link={{ href: '/auth', label: 'Back to sign in', look: 'back' }}
      />,
    ).container;

    const badge = screenNode.querySelector('.au-badge');
    expect(badge?.getAttribute('data-tone')).toBe('wait');
    expect(badge?.querySelectorAll('svg path')).toHaveLength(2);
    const link = screen.getByRole('link', { name: 'Back to sign in' });
    expect(link.parentElement?.className).toBe('au-foot');
    expect(link.className).toBe('');
  });

  it('focuses its h1 on arrival', async () => {
    await act(() => {
      render(
        <EmailLinkScreen
          tone="ok"
          heading="Email confirmed"
          sentence="Welcome to the league."
          link={{ href: '/', label: 'Continue', look: 'primary' }}
        />,
      );
      return Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('heading'));
  });
});
