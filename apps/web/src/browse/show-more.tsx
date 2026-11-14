'use client';

import Link, { useLinkStatus } from 'next/link';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface ShowMoreContextValue {
  readonly pending: boolean;
  readonly setPending: (pending: boolean) => void;
  /** Remembers where the next page starts, so only a click moves focus. */
  readonly markClicked: () => void;
}

const ShowMoreContext = createContext<ShowMoreContextValue | null>(null);

function useShowMore(): ShowMoreContextValue {
  const context = useContext(ShowMoreContext);
  if (context === null) {
    throw new Error('ShowMoreLink must be rendered inside ShowMoreRegion');
  }
  return context;
}

/**
 * The card grid plus its "Show more" area. While the next page loads the grid is `aria-busy`
 * and the button reads "Loading more…". After a click, focus moves to the first new card, or
 * to the retry link when no card arrived; on a first load or a direct URL nothing moves.
 * Reduced motion: nothing here animates (a text swap only) and the focus scroll is instant.
 */
export function ShowMoreRegion({
  entryCount,
  more,
  children,
}: {
  readonly entryCount: number;
  readonly more: ReactNode;
  readonly children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const focusFromIndex = useRef<number | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  // `more` is a dependency too: a failed page keeps the same count but swaps the slot to a retry.
  useEffect(() => {
    const from = focusFromIndex.current;
    if (from === null) return;
    if (entryCount > from) {
      focusFromIndex.current = null;
      gridRef.current?.children[from]?.querySelector('a')?.focus();
      return;
    }
    // The slot renders right after the grid, so the retry is found from their shared parent.
    const retry =
      gridRef.current?.parentElement?.querySelector<HTMLElement>('[data-more-retry]');
    if (retry) {
      focusFromIndex.current = null;
      retry.focus();
    }
  }, [entryCount, more]);

  return (
    <ShowMoreContext.Provider
      value={{
        pending,
        setPending,
        markClicked: () => {
          focusFromIndex.current = entryCount;
        },
      }}
    >
      <ul className="br-grid" aria-busy={pending || undefined} ref={gridRef}>
        {children}
      </ul>
      {more}
    </ShowMoreContext.Provider>
  );
}

/** Asks for one more page, keeping the scroll position; ignores clicks while one is loading. */
export function ShowMoreLink({ href }: { readonly href: string }) {
  const { pending, markClicked } = useShowMore();
  return (
    <Link
      className="ol-btn ol-btn--secondary br-more"
      href={href}
      scroll={false}
      prefetch={false}
      rel="nofollow"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        markClicked();
      }}
    >
      <ShowMoreLabel />
    </Link>
  );
}

function ShowMoreLabel() {
  const { pending } = useLinkStatus();
  const { setPending } = useShowMore();
  // useLinkStatus only works under its Link, so the pending flag is bridged up to the grid here.
  useEffect(() => {
    setPending(pending);
    return () => setPending(false);
  }, [pending, setPending]);
  return pending ? 'Loading more…' : 'Show more';
}
