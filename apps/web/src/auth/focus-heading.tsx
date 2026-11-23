'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import type { SIGN_IN_HEADING_ID } from './sign-in-form-view';

type FocusHeadingProps = {
  readonly children: ReactNode;
  /** The heading that takes focus back when this one unmounts. */
  readonly restoreTo?: typeof SIGN_IN_HEADING_ID;
};

/**
 * The `h1` of a screen that arrives (ADR 0015 Addendum v3b decision 6): focused once when it mounts,
 * with no live region, unless the visitor is already in that screen (a field typed in before
 * hydration). A passive cleanup runs after React removed the screen, so the element named by
 * `restoreTo` is visible again by then; a hidden or detached target ignores `focus()`.
 */
export function FocusHeading({ children, restoreTo }: FocusHeadingProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!heading.current?.parentElement?.contains(document.activeElement)) {
      heading.current?.focus();
    }
    if (restoreTo === undefined) {
      return undefined;
    }
    return () => document.getElementById(restoreTo)?.focus();
  }, [restoreTo]);
  return (
    <h1 ref={heading} tabIndex={-1}>
      {children}
    </h1>
  );
}
