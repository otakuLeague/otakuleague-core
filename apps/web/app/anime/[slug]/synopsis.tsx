'use client';

import { type ReactNode, useState } from 'react';

/**
 * The synopsis text with its "Read more" toggle. The server decides whether it collapses, so
 * nothing shifts after hydration. Expanding is instant (no animation), so reduced motion
 * needs nothing extra.
 */
export function CollapsibleSynopsis({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const state = expanded ? 'expanded' : 'collapsed';
  return (
    <>
      <div className="ov-syn" id={id} data-state={state}>
        {children}
      </div>
      <button
        type="button"
        className="ov-link-btn"
        aria-expanded={expanded}
        aria-controls={id}
        data-state={state}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </>
  );
}
