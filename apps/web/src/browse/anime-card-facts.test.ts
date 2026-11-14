import { describe, expect, it } from 'vitest';
import { cardTitle, coverSrc } from './anime-card-facts';

describe('coverSrc', () => {
  it('keeps only an absolute https URL', () => {
    const https = 'https://s4.anilist.co/cover.jpg';
    expect(coverSrc({ coverImageUrl: https })).toBe(https);
    for (const coverImageUrl of [
      null,
      '',
      'http://s4.anilist.co/cover.jpg',
      'javascript:alert(1)',
      '/cover.jpg',
      '//evil.example/cover.jpg',
    ]) {
      expect(coverSrc({ coverImageUrl }), String(coverImageUrl)).toBeNull();
    }
  });
});

describe('cardTitle', () => {
  it('prefers English, then romaji, then a placeholder', () => {
    expect(cardTitle({ titleEnglish: 'Monster', titleRomaji: 'MONSTER' })).toBe(
      'Monster',
    );
    expect(cardTitle({ titleEnglish: null, titleRomaji: 'Mushishi' })).toBe(
      'Mushishi',
    );
    expect(cardTitle({ titleEnglish: null, titleRomaji: null })).toBe(
      'Untitled',
    );
  });

  it('treats a blank title as missing', () => {
    expect(cardTitle({ titleEnglish: '  ', titleRomaji: 'Mushishi' })).toBe(
      'Mushishi',
    );
    expect(cardTitle({ titleEnglish: '', titleRomaji: '\t' })).toBe(
      'Untitled',
    );
  });
});
