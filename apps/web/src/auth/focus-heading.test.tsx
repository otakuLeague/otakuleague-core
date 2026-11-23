import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusHeading } from './focus-heading';
import { SIGN_IN_HEADING_ID } from './sign-in-form-view';

const heading = (name: string) => screen.getByRole('heading', { name });

describe('FocusHeading', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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
  });

  it('does not take focus from a field of its own panel (typed in before hydration)', () => {
    render(
      <div>
        <FocusHeading>Arrived</FocusHeading>
        <input aria-label="Username" ref={(input) => input?.focus()} />
      </div>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Username'));
  });

  it('gives focus to restoreTo when it unmounts, and nowhere without it', () => {
    const page = (arrived: 'restore' | 'plain' | null) => (
      <>
        <h1 id={SIGN_IN_HEADING_ID} tabIndex={-1}>
          Before
        </h1>
        <section>
          {arrived === 'restore' && (
            <FocusHeading restoreTo={SIGN_IN_HEADING_ID}>Arrived</FocusHeading>
          )}
          {arrived === 'plain' && <FocusHeading>Arrived</FocusHeading>}
        </section>
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
      <FocusHeading restoreTo={SIGN_IN_HEADING_ID}>Arrived</FocusHeading>,
    );
    expect(unmount).not.toThrow();
  });
});
