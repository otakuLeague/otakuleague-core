import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusHeading } from './focus-heading';

const before = () => (
  <h1 id="before" tabIndex={-1}>
    Before
  </h1>
);
const heading = (name: string) => screen.getByRole('heading', { name });

describe('FocusHeading', () => {
  afterEach(cleanup);

  it('focuses its h1, which is not in the tab order, once when it mounts', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<FocusHeading>Arrived</FocusHeading>);
    rerender(<FocusHeading>Arrived</FocusHeading>);
    expect(document.activeElement).toBe(heading('Arrived'));
    expect([heading('Arrived').tagName, heading('Arrived').tabIndex]).toEqual([
      'H1',
      -1,
    ]);
    expect(focus).toHaveBeenCalledOnce();
    focus.mockRestore();
  });

  it('gives focus to restoreTo when it unmounts, and nowhere without it', () => {
    const page = (arrived: 'restore' | 'plain' | null) => (
      <>
        {before()}
        {arrived === 'restore' && (
          <FocusHeading restoreTo="before">Arrived</FocusHeading>
        )}
        {arrived === 'plain' && <FocusHeading>Arrived</FocusHeading>}
      </>
    );
    const { rerender } = render(page('restore'));
    rerender(page(null));
    expect(document.activeElement).toBe(heading('Before'));

    rerender(page('plain'));
    rerender(page(null));
    expect(document.activeElement).toBe(document.body);
  });

  it('does not throw when restoreTo names no element', () => {
    const { unmount } = render(
      <FocusHeading restoreTo="missing">Arrived</FocusHeading>,
    );
    expect(unmount).not.toThrow();
  });
});
