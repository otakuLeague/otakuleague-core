import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialRandom } from './test-app';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('FixedClock', () => {
  it('returns the same instant on every call', () => {
    const clock = new FixedClock(new Date('2026-01-02T03:04:05.000Z'));

    expect(clock.now().toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(clock.now().toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('is not changed by mutating a returned Date', () => {
    const clock = new FixedClock(new Date('2026-01-02T03:04:05.000Z'));

    clock.now().setFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('is not changed by mutating the Date it was built with', () => {
    const instant = new Date('2026-01-02T03:04:05.000Z');
    const clock = new FixedClock(instant);

    instant.setFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('SequentialRandom', () => {
  it('returns predictable, distinct, UUID v4-shaped values', () => {
    const random = new SequentialRandom();

    const uuids = Array.from({ length: 3 }, () => random.uuid());

    expect(uuids).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    for (const uuid of uuids) {
      expect(uuid).toMatch(UUID_V4);
    }
  });

  it('starts over for each new instance', () => {
    new SequentialRandom().uuid();

    expect(new SequentialRandom().uuid()).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
  });
});
