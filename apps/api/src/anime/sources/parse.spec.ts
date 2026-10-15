import { describe, expect, it } from 'vitest';
import { httpUrl, partialDate, synopsisText } from './parse';

describe('synopsisText', () => {
  it('turns AniList HTML into paragraphs of plain text', () => {
    expect(
      synopsisText(
        'Centuries ago, <i>mankind</i> was slaughtered.<br><br>\nNow &mdash; &quot;Titans&quot; &amp; walls.<br>(Source: Crunchyroll)',
      ),
    ).toBe(
      'Centuries ago, mankind was slaughtered.\n\nNow — "Titans" & walls.\n(Source: Crunchyroll)',
    );
  });

  it('drops scripts and styles with their content, and every other tag', () => {
    expect(
      synopsisText(
        '<p>Hi</p><script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)>there',
      ),
    ).toBe('Hi\n\nthere');
  });

  it('decodes escaped markup to text, which the web app renders as text', () => {
    expect(synopsisText('&lt;b&gt;bold&lt;/b&gt; &#39;x&#x27;')).toBe(
      "<b>bold</b> 'x'",
    );
  });

  it('collapses blank lines and trims', () => {
    expect(synopsisText('  a  \r\n\r\n\r\n\r\n  b  ')).toBe('a\n\nb');
  });

  it.each([null, 42, '', '   ', '<br><br>'])('returns null for %j', (input) => {
    expect(synopsisText(input)).toBeNull();
  });
});

describe('partialDate', () => {
  it('keeps the known parts', () => {
    expect(partialDate({ year: 2026, month: null, day: null })).toEqual({
      year: 2026,
      month: null,
      day: null,
    });
  });

  it('needs a year and drops out-of-range parts', () => {
    expect(partialDate({ year: null, month: 4, day: 7 })).toBeNull();
    expect(partialDate({ year: 2013, month: 13, day: 40 })).toEqual({
      year: 2013,
      month: null,
      day: null,
    });
  });
});

describe('httpUrl', () => {
  it.each([
    ['https://anilist.co/anime/1', 'https://anilist.co/anime/1'],
    ['javascript:alert(1)', null],
    ['not a url', null],
    [42, null],
  ])('%j -> %j', (input, expected) => {
    expect(httpUrl(input)).toBe(expected);
  });
});
