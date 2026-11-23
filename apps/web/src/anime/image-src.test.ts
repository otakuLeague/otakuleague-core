import { describe, expect, it } from 'vitest';
import { imageSrc } from './image-src';

describe('imageSrc', () => {
  it('keeps a canonical https URL', () => {
    const url = 'https://s4.anilist.co/cover.jpg';
    expect(imageSrc(url)).toBe(url);
  });

  it('rejects every other form', () => {
    for (const url of [
      'https:/s4.anilist.co/x.jpg',
      'https:s4.anilist.co/x.jpg',
      '//s4.anilist.co/x.jpg',
      '/x.jpg',
      'http://s4.anilist.co/x.jpg',
      'https://user:pw@s4.anilist.co/x.jpg',
      'https://user@s4.anilist.co/x.jpg',
      'HTTPS://s4.anilist.co/x.jpg',
      'https://',
      'https://s4.anilist.co:8443/x.jpg',
      'https://s4.anilist.co\\@evil.example/x.jpg',
      'https://@s4.anilist.co/x.jpg',
      'https://s4%2Eanilist.co/x.jpg',
      'https://s4.anilist.co/x\t.jpg',
      'https://\\s4.anilist.co/x.jpg',
      '',
      null,
      undefined,
    ]) {
      expect(imageSrc(url), String(url)).toBeNull();
    }
  });
});
