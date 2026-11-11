import { describe, expect, it, vi } from 'vitest';

// next/font/google only works inside the Next compiler; the layout is imported for its metadata.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: 'font-var' });
  return {
    Bricolage_Grotesque: font,
    Instrument_Sans: font,
    JetBrains_Mono: font,
  };
});

describe('root layout metadata', () => {
  it('is noindex, nofollow while the beta is blocked', async () => {
    const { metadata } = await import('./layout');

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
