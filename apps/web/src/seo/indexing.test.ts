import { describe, expect, it, vi } from 'vitest';
import { robotsMetadata } from './indexing';

// next/font/google only works inside the Next compiler; the layout is imported for its metadata.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: 'font-var' });
  return {
    Bricolage_Grotesque: font,
    Instrument_Sans: font,
    JetBrains_Mono: font,
  };
});

describe('robotsMetadata', () => {
  it('blocks indexing and link following when blocked', () => {
    expect(robotsMetadata('blocked')).toEqual({ index: false, follow: false });
  });

  it('allows indexing and link following when allowed', () => {
    expect(robotsMetadata('allowed')).toEqual({ index: true, follow: true });
  });
});

describe('root layout metadata', () => {
  it('is noindex, nofollow while the beta is blocked', async () => {
    const { metadata } = await import('../../app/layout');

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
