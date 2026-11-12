import { describe, expect, it } from 'vitest';
import { httpUrl, partialDate, stripTags, synopsisText } from './parse';

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

  it('does not throw on a tag cut in half', () => {
    expect(synopsisText(`${'a'.repeat(19_998)}<br>`)).toBe(
      `${'a'.repeat(19_998)}<b`,
    );
  });

  it('is fast on a huge run of "<"', () => {
    const started = performance.now();

    synopsisText('<'.repeat(100_000));

    expect(performance.now() - started).toBeLessThan(1_000);
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
