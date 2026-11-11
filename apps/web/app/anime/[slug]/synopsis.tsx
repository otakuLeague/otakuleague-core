'use client';

import { type ReactNode, useState } from 'react';

/**
 * The synopsis text with its "Read more" toggle. The server decides whether it collapses, so
 * nothing shifts after hydration. Expanding is instant (no animation), so reduced motion
 * needs nothing extra.
 */
export function CollapsibleSynopsis({
  id,
  clamp,
  children,
}: {
  readonly id: string;
  /** The first paragraph is long: clamp it with a fade while collapsed. */
  readonly clamp: boolean;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const state = expanded ? 'expanded' : 'collapsed';
  return (
    <>
      <div
        className={clamp ? 'ov-syn ov-syn--clamp' : 'ov-syn'}
        id={id}
        data-state={state}
      >
        {children}
      </div>
      <button
        type="button"
        className="ov-link-btn ov-syn-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </>
  );
}
