'use client';

import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';

/**
 * A header menu as a native `<details>` (ADR 0014): it opens and closes without JavaScript, and
 * `name` keeps one header menu open at a time. React holds no open state; this enhancer only
 * closes it: on Esc (focus back on the summary), a pointer down outside, focus moving outside,
 * or a click on a link inside (a soft navigation would otherwise leave it open).
 */
export function Disclosure({
  summary,
  summaryClassName,
  summaryLabel,
  active = false,
  align = 'start',
  children,
}: {
  readonly summary: ReactNode;
  readonly summaryClassName: string;
  readonly summaryLabel?: string;
  readonly active?: boolean;
  readonly align?: 'start' | 'end';
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = ref.current;
      if (
        details?.open === true &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        details.open = false;
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    if (event.key !== 'Escape' || !details.open) return;
    details.open = false;
    details.querySelector('summary')?.focus();
  };

  // A null relatedTarget (window blur, click on nothing focusable) is left to pointerdown.
  const onBlur = (event: FocusEvent<HTMLDetailsElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !event.currentTarget.contains(next)) {
      event.currentTarget.open = false;
    }
  };

  const onClick = (event: MouseEvent<HTMLDetailsElement>) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) {
      event.currentTarget.open = false;
    }
  };

  return (
    <details
      ref={ref}
      name="sh-menu"
      className="sh-has-pop"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onClick={onClick}
    >
      <summary
        className={summaryClassName}
        aria-label={summaryLabel}
        data-active={active ? '' : undefined}
      >
        {summary}
      </summary>
      <div
        className={`sh-pop sh-menu ol-glass${align === 'end' ? ' sh-pop--end' : ''}`}
      >
        {children}
      </div>
    </details>
  );
}
