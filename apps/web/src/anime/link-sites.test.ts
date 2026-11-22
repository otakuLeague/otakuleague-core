import type { AnimeLink } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import { contrastRatio, MIN_TEXT_CONTRAST } from './accent';
import { animeFixture, sourced } from './fixtures';
import { officialLinksOf, SITE_BADGES, siteKey } from './link-sites';

const link = (
  site: string,
  url: string,
  kind: AnimeLink['kind'] = 'other',
): AnimeLink => ({ site, url, kind });
const linksOf = (links: readonly AnimeLink[]) =>
  officialLinksOf(animeFixture({ links: sourced(links) }));

describe('officialLinksOf', () => {
  it('drops anything but plain http(s) URLs', () => {
    const links = linksOf([
      link('Evil', 'javascript:alert(1)'),
      link('Data', 'data:text/html,<b>x</b>'),
      link('Creds', 'https://user:pw@example.com/'),
      link('Long', `https://example.com/${'a'.repeat(2048)}`),
      link('Broken', 'not a url'),
      link('Official Site', 'https://shingeki.tv/'),
    ]);
    expect(links.map((l) => l.url)).toEqual(['https://shingeki.tv/']);
  });

  it('orders streaming first, then known sites in map order, then by name', () => {
    const links = linksOf([
      link('Zeta Fan Wiki', 'https://zeta.example/'),
      link('Twitter', 'https://twitter.com/aot'),
      link('Netflix', 'https://netflix.com/aot', 'streaming'),
      link('Alpha Blog', 'https://alpha.example/'),
      link('Official Site', 'https://shingeki.tv/'),
      link('Crunchyroll', 'https://crunchyroll.com/aot', 'streaming'),
    ]);
    expect(links.map((l) => l.label)).toEqual([
      'Watch on Crunchyroll',
      'Watch on Netflix',
      'Official Site',
      'Twitter',
      'Alpha Blog',
      'Zeta Fan Wiki',
    ]);
    expect(links[0]?.kind).toBe('streaming');
  });

  it('keeps one link per URL and at most 12', () => {
    expect(
      linksOf([
        link('Crunchyroll', 'https://crunchyroll.com/aot', 'streaming'),
        link('Crunchyroll', 'https://CRUNCHYROLL.com/aot', 'streaming'),
      ]),
    ).toHaveLength(1);
    const many = Array.from({ length: 20 }, (_, i) =>
      link(`Site ${i}`, `https://s${i}.example/`),
    );
    expect(linksOf(many)).toHaveLength(12);
  });

  it('gives an unknown site a neutral badge with its first letter or digit', () => {
    const badges = new Map(
      linksOf([
        link('  über anime', 'https://a.example/'),
        link('9anime', 'https://b.example/'),
        link('★', 'https://c.example/'),
        link('Disney+', 'https://disneyplus.com/', 'streaming'),
      ]).map((l) => [l.label, l.badge]),
    );
    expect(Object.fromEntries(badges)).toEqual({
      'Watch on Disney+': {
        kind: 'brand',
        color: '#113ccf',
        ink: '#ffffff',
        initial: 'D',
      },
      'über anime': { kind: 'neutral', initial: 'Ü' },
      '9anime': { kind: 'neutral', initial: '9' },
      '★': { kind: 'neutral', initial: '?' },
    });
  });
});

describe('SITE_BADGES', () => {
  it('keys are siteKey() of themselves', () => {
    for (const key of SITE_BADGES.keys()) expect(siteKey(key)).toBe(key);
  });

  it('every badge initial reads at 4.5:1 on its brand colour', () => {
    for (const [site, { color }] of SITE_BADGES) {
      const [badge] = officialLinksOf(
        animeFixture({ links: sourced([link(site, 'https://x.example/')]) }),
      ).map((l) => l.badge);
      expect(badge?.kind, site).toBe('brand');
      if (badge?.kind !== 'brand') continue;
      expect(contrastRatio(badge.ink, color), site).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
  });
});
