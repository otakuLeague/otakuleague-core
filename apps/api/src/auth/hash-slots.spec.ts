import { describe, expect, it, vi } from 'vitest';
import {
  HashSlots,
  MAX_RUNNING_HASHES,
  MAX_WAITING_HASHES,
} from './hash-slots';

/** `make(name)`: a task held until `finish` or `fail`; `started` lists the tasks called, in order. */
function tasks() {
  const started: string[] = [];
  const make = (name: string) => {
    let finish: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<string>((resolve, reject) => {
      finish = () => resolve(name);
      fail = reject;
    });
    const task = () => {
      started.push(name);
      return promise;
    };
    return {
      task,
      finish: () => finish(),
      fail: (error: Error) => fail(error),
    };
  };
  return { started, make };
}

/** Lets every pending promise callback run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('HashSlots', () => {
  it('leaves libuv threads free for DNS and file I/O', () => {
    expect(MAX_RUNNING_HASHES).toBeLessThan(4);
  });

  it('runs two at once and holds the third until a slot frees', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const held = ['a', 'b', 'c'].map(make);
    const runs = held.map(({ task }) => slots.run(task));

    await settle();
    expect(started).toEqual(['a', 'b']);

    held[0]?.finish();
    await settle();
    expect(started).toEqual(['a', 'b', 'c']);

    for (const { finish } of held) finish();
    await expect(Promise.all(runs)).resolves.toEqual(
      ['a', 'b', 'c'].map((value) => ({ kind: 'done', value })),
    );
  });

  it('starts the waiting tasks in arrival order', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const held = ['a', 'b', 'c', 'd', 'e'].map(make);
    const runs = held.map(({ task }) => slots.run(task));

    for (const { finish } of held) {
      finish();
      await settle();
    }

    expect(started).toEqual(['a', 'b', 'c', 'd', 'e']);
    await Promise.all(runs);
  });

  it('refuses one more than it can run and queue, without calling it', async () => {
    const slots = new HashSlots();
    const { make } = tasks();
    const held = Array.from(
      { length: MAX_RUNNING_HASHES + MAX_WAITING_HASHES },
      (_, index) => make(String(index)),
    );
    const runs = held.map(({ task }) => slots.run(task));
    const extra = vi.fn(() => Promise.resolve('extra'));

    await expect(slots.run(extra)).resolves.toEqual({ kind: 'busy' });
    expect(extra).not.toHaveBeenCalled();

    for (const { finish } of held) finish();
    await Promise.all(runs);
    await expect(slots.run(extra)).resolves.toEqual({
      kind: 'done',
      value: 'extra',
    });
  });

  it('gives the slot of a failed task to the next one', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const held = ['a', 'b', 'c'].map(make);
    const [failed, ...runs] = held.map(({ task }) => slots.run(task));

    held[0]?.fail(new Error('argon2 failed'));

    await expect(failed).rejects.toThrow('argon2 failed');
    await settle();
    expect(started).toEqual(['a', 'b', 'c']);
    for (const { finish } of held) finish();
    await Promise.all(runs);
  });
});

describe('HashSlots.tryRun', () => {
  it('gives the slot back after a failed task', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const failing = make('failing');

    const tried = slots.tryRun(failing.task);
    failing.fail(new Error('argon2 failed'));
    await expect(tried).rejects.toThrow('argon2 failed');
    const held = ['a', 'b'].map(make);
    const runs = held.map(({ task }) => slots.run(task));
    await settle();

    // A leaked slot would leave 'b' waiting.
    expect(started).toEqual(['failing', 'a', 'b']);
    for (const { finish } of held) finish();
    await Promise.all(runs);
  });

  it.each([
    ['every slot runs', MAX_RUNNING_HASHES],
    ['others wait', MAX_RUNNING_HASHES + 1],
  ])(
    'skips without calling the task or queuing when %s',
    async (_, occupying) => {
      const slots = new HashSlots();
      const { started, make } = tasks();
      const held = Array.from({ length: occupying }, (__, index) =>
        make(String(index)),
      );
      const runs = held.map(({ task }) => slots.run(task));
      const optional = vi.fn(() => Promise.resolve('optional'));

      await expect(slots.tryRun(optional)).resolves.toEqual({
        kind: 'skipped',
      });

      expect(optional).not.toHaveBeenCalled();
      for (const { finish } of held) {
        finish();
        await settle();
      }
      await Promise.all(runs);
      expect(started).toHaveLength(occupying);
      // Nothing was queued for it: the slots are free again.
      await expect(slots.tryRun(optional)).resolves.toEqual({
        kind: 'done',
        value: 'optional',
      });
    },
  );
});
