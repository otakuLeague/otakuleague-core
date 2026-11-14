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
