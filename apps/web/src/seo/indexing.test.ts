import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { robotsHeaders, robotsMetadata } from './indexing';

describe('robotsMetadata', () => {
  it('blocks indexing and link following when blocked', () => {
    expect(robotsMetadata('blocked')).toEqual({ index: false, follow: false });
  });

  it('allows indexing and link following when allowed', () => {
    expect(robotsMetadata('allowed')).toEqual({ index: true, follow: true });
  });
});

describe('robotsHeaders', () => {
  it('sends X-Robots-Tag noindex, nofollow on every route when blocked', () => {
    expect(robotsHeaders('blocked')).toEqual([
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]);
  });

  it('keeps only the AniList id redirect route out of the index when allowed', () => {
    expect(robotsHeaders('allowed')).toEqual([
      {
        source: '/anime/anilist/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]);
  });
});

describe('robots metadata key', () => {
  it('is set only in app/layout.tsx, so no page overrides the root value', () => {
    const appDir = path.resolve(__dirname, '../../app');
    const offenders = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => file !== 'layout.tsx')
      .filter((file) =>
        /\brobots\s*:/.test(readFileSync(path.join(appDir, file), 'utf8')),
      );

    expect(offenders).toEqual([]);
  });
});

describe('public/robots.txt', () => {
  const robotsTxt = readFileSync(
    path.resolve(__dirname, '../../public/robots.txt'),
    'utf8',
  );

  it('keeps crawlers out of the AniList id route, which imports on first visit (OTA-173)', () => {
    expect(robotsTxt).toMatch(/^Disallow: \/anime\/anilist\/$/m);
  });

  it('keeps crawlers off the season pages until OTA-189', () => {
    expect(robotsTxt).toMatch(/^Disallow: \/season\?$/m);
  });

  it('never blocks the whole site, so crawlers can still read the noindex (OTA-134)', () => {
    expect(robotsTxt).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });
});
