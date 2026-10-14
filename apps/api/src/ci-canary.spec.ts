import { expect, it } from 'vitest';

it('deliberately fails to prove CI goes red', () => {
  expect(1).toBe(2);
});
