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
  it('drops anything but http(s) URLs to a public host name', () => {
    const links = linksOf([
      link('Evil', 'javascript:alert(1)'),
      link('Data', 'data:text/html,<b>x</b>'),
      link('Creds', 'https://user:pw@example.com/'),
      link('Local', 'http://localhost:3000/'),
      link('IPv4', 'http://127.0.0.1/'),
      link('Int', 'http://2130706433/'),
      link('IPv6', 'http://[::1]/'),
      link('Broken', 'not a url'),
      link('Official Site', 'https://shingeki.tv/'),
    ]);
    expect(links.map((l) => l.url)).toEqual(['https://shingeki.tv/']);
  });

  it('caps the URL at 2,048 characters, before and after parsing', () => {
    const at = (length: number) =>
      `https://e.example/${'a'.repeat(length - 18)}`;
    expect(linksOf([link('A', at(2048))])).toHaveLength(1);
    expect(linksOf([link('A', at(2049))])).toHaveLength(0);
    // Parsing percent-encodes spaces: 2,000 characters become more than 2,048.
    expect(
      linksOf([link('A', `https://e.example/${' x'.repeat(990)}`)]),
    ).toHaveLength(0);
  });

  it('accepts an upper-case scheme and a padded URL', () => {
    expect(
      linksOf([
        link('Official Site', 'HTTPS://Shingeki.TV/'),
        link('Netflix', '  https://www.netflix.com/title/1  ', 'streaming'),
      ]).map((l) => l.url),
    ).toEqual(['https://www.netflix.com/title/1', 'https://shingeki.tv/']);
  });

  it('orders streaming first, then known sites in map order, then by name', () => {
    const links = linksOf([
      link('Zeta Fan Wiki', 'https://zeta.example/'),
      link('Twitter', 'https://twitter.com/aot'),
      link('Netflix', 'https://netflix.com/aot', 'streaming'),
      link('Alpha Blog', 'https://alpha.example/'),
      link('Official Site', 'https://shingeki.tv/'),
      link('Crunchyroll', 'https://www.crunchyroll.com/aot', 'streaming'),
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

  it('shows a brand only on its own host; elsewhere the host name, neutral', () => {
    const [mismatch] = linksOf([
      link('Crunchyroll', 'https://crunchyroll.evil.example/', 'streaming'),
    ]);
    expect(mismatch).toMatchObject({
      label: 'Watch on crunchyroll.evil.example',
      badge: { kind: 'neutral', initial: 'C' },
    });
  });

  it('labels an empty or over-long site name with the host name', () => {
    expect(
      linksOf([
        link('', 'https://a.example/'),
        link('y'.repeat(61), 'https://b.example/'),
      ]).map((l) => l.label),
    ).toEqual(['a.example', 'b.example']);
  });

  it('adds the host name to a repeated label', () => {
    expect(
      linksOf([
        link('Official Site', 'https://shingeki.tv/'),
        link('Official Site', 'https://shingeki.example/'),
      ]).map((l) => l.label),
    ).toEqual([
      'Official Site · shingeki.tv',
      'Official Site · shingeki.example',
    ]);
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

  it('gives unknown sites and the official site a neutral badge', () => {
    const badges = Object.fromEntries(
      linksOf([
        link('  über anime', 'https://a.example/'),
        link('9anime', 'https://b.example/'),
        link('★', 'https://c.example/'),
        link('Official Site', 'https://shingeki.tv/'),
        link('Disney+', 'https://www.disneyplus.com/', 'streaming'),
      ]).map((l) => [l.label, l.badge]),
    );
    expect(badges).toEqual({
      'Watch on Disney+': {
        kind: 'brand',
        color: '#113ccf',
        ink: '#ffffff',
        initial: 'D',
      },
      'Official Site': { kind: 'neutral', initial: 'O' },
      'über anime': { kind: 'neutral', initial: 'Ü' },
      '9anime': { kind: 'neutral', initial: '9' },
      '★': { kind: 'neutral', initial: '?' },
    });
  });
});

describe('SITE_BADGES', () => {
  it('keys are siteKey() of themselves, colours plain hex with own domains', () => {
    for (const [key, badge] of SITE_BADGES) {
      expect(siteKey(key)).toBe(key);
      if (badge.color === null) continue;
      expect(badge.color, key).toMatch(/^#[0-9a-f]{6}$/u);
      expect(badge.domains.length, key).toBeGreaterThan(0);
    }
  });

  it('every brand badge initial reads at 4.5:1 on its colour', () => {
    for (const [site, { color, domains }] of SITE_BADGES) {
      if (color === null) continue;
      const [badge] = officialLinksOf(
        animeFixture({
          links: sourced([link(site, `https://${domains[0]}/`)]),
        }),
      ).map((l) => l.badge);
      expect(badge?.kind, site).toBe('brand');
      if (badge?.kind !== 'brand') continue;
      expect(contrastRatio(badge.ink, color), site).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
  });
});
