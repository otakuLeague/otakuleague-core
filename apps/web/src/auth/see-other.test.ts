// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMAIL_LINK_LANDINGS } from './email-link';
import { seeOther } from './see-other';

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
        'referrer-policy': ['no', 'referrer'].join('-'),
      });
    },
  );
});
