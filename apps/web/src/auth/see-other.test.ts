// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMAIL_LINK_LANDINGS } from './email-link';
import { refuseSpeculation, seeOther } from './see-other';

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
