import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, SOCIAL_LINKS, SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  afterEach(cleanup);

  it('links the site and legal pages', () => {
    render(<SiteFooter />);

    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(
      within(legal)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/privacy', '/terms', '/data-sources']);
    expect(
      within(legal).getByRole('link', { name: 'Data sources' }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Cookies' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'About & FAQ' }).getAttribute('href'),
    ).toBe('/faq');
    expect(
      screen.getByRole('link', { name: 'Contact' }).getAttribute('href'),
    ).toBe(`mailto:${CONTACT_EMAIL}`);
  });

  it('opens the roadmap and every social network in a new tab, without an opener', () => {
    render(<SiteFooter />);

    const external = [
      screen.getByRole('link', { name: /Roadmap/ }),
      ...SOCIAL_LINKS.map((social) =>
        screen.getByRole('link', { name: `OtakuLeague on ${social.name}` }),
      ),
    ];
    expect(external).toHaveLength(6);
    for (const link of external) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  it('shows the contact email, the data attribution and the theme switch', () => {
    render(<SiteFooter />);

    expect(
      screen.getByRole('link', { name: CONTACT_EMAIL }).getAttribute('href'),
    ).toBe(`mailto:${CONTACT_EMAIL}`);
    expect(
      screen
        .getByRole('link', { name: 'Anime data from AniList' })
        .getAttribute('href'),
    ).toBe('/data-sources');
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeDefined();
  });
});
