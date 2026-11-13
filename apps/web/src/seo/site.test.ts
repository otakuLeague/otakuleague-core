import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absoluteUrl, robotsRules, SITE_URL, sitemapEntries } from './site';

describe('absoluteUrl', () => {
  it('resolves a path against the canonical site', () => {
    expect(absoluteUrl('/faq')).toBe('https://otakuleague.com/faq');
  });

  it('turns the root path into the bare origin with a slash', () => {
    expect(absoluteUrl('/')).toBe('https://otakuleague.com/');
  });
});

describe('robotsRules', () => {
  it('keeps crawlers out of the AniList id route, which imports on first visit (OTA-173)', () => {
    expect(robotsRules('blocked').rules).toEqual({
      userAgent: '*',
      disallow: '/anime/anilist/',
    });
  });

  it('has no Sitemap line while blocked', () => {
    expect(robotsRules('blocked').sitemap).toBeUndefined();
  });

  it('adds the absolute sitemap URL once allowed', () => {
    const robots = robotsRules('allowed');

    expect(robots.sitemap).toBe('https://otakuleague.com/sitemap.xml');
    expect(robots.rules).toEqual(robotsRules('blocked').rules);
  });

  it.each(['blocked', 'allowed'] as const)(
    'never disallows the whole site when %s, so crawlers can read the noindex (OTA-134)',
    (indexing) => {
      expect(JSON.stringify(robotsRules(indexing).rules)).not.toMatch(
        /"disallow":"\/"/,
      );
    },
  );
});

describe('sitemapEntries', () => {
  it('lists exactly the static pages as absolute URLs on the canonical site', () => {
    expect(sitemapEntries().map((entry) => entry.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/faq`,
      `${SITE_URL}/privacy`,
      `${SITE_URL}/terms`,
      `${SITE_URL}/data-sources`,
    ]);
  });

  it('leaves out anime, debug and hikari pages', () => {
    const urls = sitemapEntries().map((entry) => entry.url);

    expect(urls.filter((url) => /\/(anime|debug|hikari)/.test(url))).toEqual(
      [],
    );
  });
});

describe('page metadata', () => {
  // Pages without their own canonical: a redirect-only route, an error page and dev-only pages.
  const NO_CANONICAL = [
    'anime-not-found/',
    'debug/',
    path.join('anime', 'anilist') + path.sep,
  ];

  it('gives every page a canonical, directly or through legalMetadata/tabMetadata', () => {
    const appDir = path.resolve(__dirname, '../../app');
    const offenders = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => path.basename(file) === 'page.tsx')
      .filter(
        (file) =>
          !NO_CANONICAL.some((prefix) =>
            file.startsWith(prefix.replaceAll('/', path.sep)),
          ),
      )
      .filter(
        (file) =>
          !/canonical|legalMetadata\(|tabMetadata\(/.test(
            readFileSync(path.join(appDir, file), 'utf8'),
          ),
      );

    expect(offenders).toEqual([]);
  });
});
