import { describe, expect, it } from 'vitest';
import {
  boundedNames,
  countryCode,
  hashtags,
  httpUrl,
  partialDate,
  stripTags,
  synopsisText,
} from './parse';

describe('countryCode', () => {
  it.each(['JP', 'KR', 'CN', 'ZZ'])('keeps %j', (input) => {
    expect(countryCode(input)).toBe(input);
  });

  it.each([
    'jp',
    'Jp',
    'JPN',
    'J',
    '',
    ' JP',
    'JP ',
    'J1',
    'Japan',
    'ＪＰ',
    81,
    null,
    undefined,
  ])('returns null for %j', (input) => {
    expect(countryCode(input)).toBeNull();
  });
});

describe('hashtags', () => {
  it('splits one string into every tag, in order', () => {
    expect(hashtags('#フリーレン #frieren')).toEqual([
      '#フリーレン',
      '#frieren',
    ]);
  });

  it('keeps a single tag and splits tags glued together', () => {
    expect(hashtags('#frieren')).toEqual(['#frieren']);
    expect(hashtags('#a#b')).toEqual(['#a', '#b']);
  });

  it('stores a full-width ＃ as #', () => {
    expect(hashtags('＃葬送のフリーレン #frieren')).toEqual([
      '#葬送のフリーレン',
      '#frieren',
    ]);
  });

  it('drops words without #, a lone #, and duplicates', () => {
    expect(hashtags('anime #a lone # #a ＃a #b')).toEqual(['#a', '#b']);
  });

  it('drops tags over 100 characters and keeps one of exactly 100', () => {
    const exactly = `#${'x'.repeat(99)}`;
    expect(hashtags(`${exactly} #${'x'.repeat(100)} #ok`)).toEqual([
      exactly,
      '#ok',
    ]);
  });

  it('trims trailing punctuation, so tags split by 、 stay two', () => {
    expect(hashtags('#a、#b')).toEqual(['#a', '#b']);
    expect(hashtags('#frieren! #x。 #、')).toEqual(['#frieren', '#x']);
  });

  it('removes zero-width characters and dedupes case-insensitively, keeping the first spelling', () => {
    expect(hashtags('#fri\u200Beren #Frieren #FRIEREN #other')).toEqual([
      '#frieren',
      '#other',
    ]);
  });

  it('pins the current behaviour for a URL: its fragment counts as a tag', () => {
    expect(hashtags('https://example.com/p#frag')).toEqual(['#frag']);
  });

  it('keeps middle dots and underscores, and drops URL, markup, control and bidi characters', () => {
    expect(hashtags('#ぼっち・ざ・ろっく #a_b #x·y')).toEqual([
      '#ぼっち・ざ・ろっく',
      '#a_b',
      '#x·y',
    ]);
    expect(hashtags('#../intent/tweet?text=x')).toEqual([]);
    expect(hashtags('#a\u202Eb')).toEqual(['#ab']);
    expect(hashtags('#a\u001Bb #c\u00ADd')).toEqual(['#a', '#cd']);
    expect(hashtags('#<b>x</b>')).toEqual([]);
  });

  it('cuts hostile input short and stays linear', () => {
    const started = performance.now();

    expect(hashtags(`#${'!'.repeat(80_000)}a`)).toEqual([]);
    expect(hashtags(`${'#'.repeat(80_000)}a`).length).toBeLessThanOrEqual(5);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('keeps the first 5 only', () => {
    expect(hashtags('#1 #2 #3 #4 #5 #6 #7')).toEqual([
      '#1',
      '#2',
      '#3',
      '#4',
      '#5',
    ]);
  });

  it.each([null, undefined, 42, '', '   ', 'no tags here', '#', '# #'])(
    'returns an empty list for %j',
    (input) => {
      expect(hashtags(input)).toEqual([]);
    },
  );
});

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

describe('synopsisText hostile markup', () => {
  it('does not read inherited object keys as entities', () => {
    expect(synopsisText('&constructor; &__proto__; &toString;')).toBe(
      '&constructor; &__proto__; &toString;',
    );
  });

  it('drops a script after a stray "<"', () => {
    expect(synopsisText('1 < 2 <script>evil()</script> tail')).toBe(
      '1 < 2  tail',
    );
  });

  it('drops a script inside a comment', () => {
    expect(synopsisText('<!-- <script>x</script> -->')).toBe('<!--  -->');
  });
});

describe('synopsisText raw cap', () => {
  it('keeps 20,000 characters whole and cuts 20,001 to 20,000', () => {
    expect(synopsisText('a'.repeat(20_000))).toHaveLength(20_000);
    expect(synopsisText('a'.repeat(20_001))).toHaveLength(20_000);
  });

  it('drops a surrogate pair split by the cut', () => {
    const result = synopsisText(`${'a'.repeat(19_999)}\u{1F600}`);

    expect(result).toHaveLength(19_999);
    // encodeURIComponent throws on a lone surrogate.
    expect(() => encodeURIComponent(result ?? '')).not.toThrow();
  });

  it('drops a tag cut in half', () => {
    expect(synopsisText(`${'a'.repeat(19_998)}<br>`)).toBe('a'.repeat(19_998));
  });

  it('drops an entity cut in half', () => {
    expect(synopsisText(`${'a'.repeat(19_996)}&amp;`)).toBe('a'.repeat(19_996));
  });
});

describe('stripTags', () => {
  it.each([
    ['a<br>b', 'a\nb'],
    ['a<br/>b', 'a\nb'],
    ['a<br />b', 'a\nb'],
    ['a</p >b', 'a\n\nb'],
    ['a<SCRIPT>x</SCRIPT>b', 'ab'],
    ['a<style>x</style >b', 'ab'],
    ['a<script>keep', 'akeep'],
    ['a<script>x<script>y', 'axy'],
    ['1 < 2', '1 < 2'],
    ['HP < 10.<br>Then more', 'HP < 10.\nThen more'],
    ['a < b</p>c', 'a < b\n\nc'],
    ['<i>x</i>', 'x'],
    ['', ''],
  ])('%j -> %j', (html, expected) => {
    expect(stripTags(html)).toBe(expected);
  });

  it.each([
    ['"<" x 1,048,576', '<'.repeat(1_048_576)],
    ['"<script>" x 131,072', '<script>'.repeat(131_072)],
    ['"<script" x 149,796', '<script'.repeat(149_796)],
  ])('is linear on hostile input: %s', (_name, html) => {
    const started = performance.now();

    stripTags(html);

    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('boundedNames', () => {
  it('keeps each name once, cuts long ones and keeps the first 50', () => {
    const many = Array.from({ length: 60 }, (_, index) => `Studio ${index}`);

    expect(boundedNames(['A', 'A', ' B ', null, 7, ''])).toEqual(['A', 'B']);
    expect(boundedNames(['x'.repeat(400)])[0]).toHaveLength(300);
    expect(boundedNames(many)).toEqual(many.slice(0, 50));
    expect(boundedNames([])).toEqual([]);
    expect(
      boundedNames(['A\u202EB', 'AB', 'C\u001B\u200BD', 'E\u00ADF']),
    ).toEqual(['AB', 'CD', 'EF']);
  });
});
