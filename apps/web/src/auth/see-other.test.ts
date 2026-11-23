// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMAIL_LINK_LANDINGS } from './email-link';
import { refuseSpeculation, seeOther, seeOtherFromProxy } from './see-other';

const NO_REFERRER = ['no', 'referrer'].join('-');

describe('refuseSpeculation', () => {
  it('answers a bodiless 503 with no Location, no-store and the no-Referer policy', async () => {
    const response = refuseSpeculation();

    expect(response.status).toBe(503);
    expect(response.body).toBeNull();
    expect(Object.fromEntries(response.headers)).toEqual({
      'cache-control': 'no-store',
      'referrer-policy': NO_REFERRER,
    });
    expect(await refuseSpeculation().text()).toBe('');
  });
});

describe('seeOther', () => {
  it.each(Object.values(EMAIL_LINK_LANDINGS))(
    'answers %s with a bodiless 303, a relative Location, no-store and the no-Referer policy',
    async (landing) => {
      const response = seeOther(landing);

      expect(response.status).toBe(303);
      expect(response.body).toBeNull();
      expect(await response.text()).toBe('');
      expect(Object.fromEntries(response.headers)).toEqual({
        location: landing,
        'cache-control': 'no-store',
        'referrer-policy': NO_REFERRER,
      });
    },
  );
});

describe('seeOtherFromProxy', () => {
  it('answers the same bodiless 303 under the configured origin, never the request', async () => {
    const response = seeOtherFromProxy(
      { origin: 'https://beta.otakuleague.com', isHttps: true },
      EMAIL_LINK_LANDINGS.tryAgain,
    );

    expect(response.status).toBe(303);
    expect(await response.text()).toBe('');
    expect(Object.fromEntries(response.headers)).toEqual({
      location: 'https://beta.otakuleague.com/auth/verify/try-again',
      'cache-control': 'no-store',
      'referrer-policy': NO_REFERRER,
    });
  });

  it('gives a Location that parses on its own, as the proxy adapter needs', () => {
    // Next's proxy adapter runs `new NextURL(location)`: a relative Location throws (a 500).
    const location = seeOtherFromProxy(
      { origin: 'http://localhost:3000', isHttps: false },
      EMAIL_LINK_LANDINGS.tryAgain,
    ).headers.get('location');

    expect(() => new URL(location ?? '')).not.toThrow();
  });
});
